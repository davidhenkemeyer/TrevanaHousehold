/**
 * Families and their members.
 *
 * Invariants enforced here:
 *   - Every family always keeps at least one active parent.
 *   - Only users who can sign in with email + password may be parents. A kid
 *     profile (PIN only) can't become one, since parents approve chores and
 *     manage the family.
 *   - PINs belong to kid profiles only; becoming a parent clears the PIN.
 */
import type {
  AuthResponse,
  CreateChildBody,
  CreateFamilyBody,
  FamilyDetail,
  Member,
  UpdateFamilyBody,
  UpdateMemberBody,
} from "@chores/contracts";
import { defaultAvatarColor, defaultWeeklyCapacity } from "@chores/domain";
import type { Deps } from "../../deps.js";
import { AppError, badRequest, conflict, forbidden, notFound, unauthorized } from "../../errors.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { hashSecret, verifySecret } from "../../lib/secrets.js";
import { requireMember, requireParent } from "../access.js";
import { issueSession, revokeAllSessions } from "../auth/sessions.js";
import { replanUntouched } from "../instances/generate.js";
import { toFamilyDto, toMemberDto, toUserDto } from "../dto.js";

/** Wrong PINs allowed before the profile locks, and for how long. */
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCK_MINUTES = 15;

type Tx = Prisma.TransactionClient;

export async function createFamily(
  deps: Deps,
  userId: string,
  body: CreateFamilyBody,
): Promise<FamilyDetail> {
  const familyId = await deps.db.$transaction(async (tx) => {
    const family = await tx.family.create({ data: { name: body.name, timeZone: body.timeZone } });
    await tx.membership.create({
      data: {
        familyId: family.id,
        userId,
        role: "PARENT",
        capacity: defaultWeeklyCapacity("PARENT"),
      },
    });
    return family.id;
  });
  return getFamily(deps, userId, familyId);
}

export async function getFamily(
  deps: Deps,
  userId: string,
  familyId: string,
): Promise<FamilyDetail> {
  await requireMember(deps.db, familyId, userId);
  const family = await deps.db.family.findUniqueOrThrow({
    where: { id: familyId },
    include: {
      memberships: {
        where: { active: true },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  return { family: toFamilyDto(family), members: family.memberships.map(toMemberDto) };
}

export async function updateFamily(
  deps: Deps,
  userId: string,
  familyId: string,
  body: UpdateFamilyBody,
): Promise<FamilyDetail> {
  await requireParent(deps.db, familyId, userId);
  await deps.db.family.update({
    where: { id: familyId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.timeZone !== undefined && { timeZone: body.timeZone }),
    },
  });
  return getFamily(deps, userId, familyId);
}

/** Creates a kid profile: a user with no email or password, plus a CHILD membership. */
export async function createChild(
  deps: Deps,
  userId: string,
  familyId: string,
  body: CreateChildBody,
): Promise<Member> {
  await requireParent(deps.db, familyId, userId);
  const memberCount = await deps.db.membership.count({ where: { familyId } });
  const pinHash = body.pin === undefined ? null : await hashSecret(body.pin);
  const membership = await deps.db.membership.create({
    data: {
      role: "CHILD",
      capacity: body.capacity ?? defaultWeeklyCapacity("CHILD"),
      pinHash,
      family: { connect: { id: familyId } },
      user: {
        create: {
          displayName: body.displayName,
          avatarColor: body.avatarColor ?? defaultAvatarColor(memberCount),
        },
      },
    },
    include: { user: true },
  });
  return toMemberDto(membership);
}

async function findActiveMember(db: Deps["db"] | Tx, familyId: string, membershipId: string) {
  const member = await db.membership.findFirst({
    where: { id: membershipId, familyId, active: true },
    include: { user: true },
  });
  if (!member) throw notFound("MEMBER_NOT_FOUND", "Family member not found.");
  return member;
}

async function countActiveParents(tx: Tx, familyId: string): Promise<number> {
  return tx.membership.count({ where: { familyId, active: true, role: "PARENT" } });
}

const lastParent = () =>
  conflict("LAST_PARENT", "A family needs at least one parent. Add another parent first.");

export async function updateMember(
  deps: Deps,
  userId: string,
  familyId: string,
  membershipId: string,
  body: UpdateMemberBody,
): Promise<Member> {
  await requireParent(deps.db, familyId, userId);
  // Hash outside the transaction: argon2 is slow and would hold row locks.
  const newPinHash = typeof body.pin === "string" ? await hashSecret(body.pin) : undefined;

  const updated = await deps.db.$transaction(async (tx) => {
    const target = await findActiveMember(tx, familyId, membershipId);
    const nextRole = body.role ?? target.role;

    if (nextRole === "PARENT" && target.role === "CHILD") {
      if (!target.user.email || !target.user.passwordHash) {
        throw badRequest(
          "ROLE_REQUIRES_LOGIN",
          "Only members who sign in with an email and password can be parents.",
        );
      }
    }
    if (nextRole === "CHILD" && target.role === "PARENT") {
      if ((await countActiveParents(tx, familyId)) <= 1) throw lastParent();
    }
    if (nextRole === "PARENT" && typeof body.pin === "string") {
      throw badRequest("PIN_CHILD_ONLY", "Only kid profiles have a PIN.");
    }

    const pinChange: Prisma.MembershipUpdateInput =
      nextRole === "PARENT" || body.pin === null
        ? { pinHash: null, pinFailedAttempts: 0, pinLockedUntil: null }
        : newPinHash !== undefined
          ? { pinHash: newPinHash, pinFailedAttempts: 0, pinLockedUntil: null }
          : {};

    if (body.displayName !== undefined || body.avatarColor !== undefined) {
      await tx.user.update({
        where: { id: target.userId },
        data: {
          ...(body.displayName !== undefined && { displayName: body.displayName }),
          ...(body.avatarColor !== undefined && { avatarColor: body.avatarColor }),
        },
      });
    }
    const member = await tx.membership.update({
      where: { id: target.id },
      data: {
        role: nextRole,
        ...(body.capacity !== undefined && { capacity: body.capacity }),
        ...pinChange,
      },
      include: { user: true },
    });
    // New capacity changes who should get which upcoming chores.
    if (body.capacity !== undefined) await replanUntouched(tx, familyId, deps.now());
    return member;
  });
  return toMemberDto(updated);
}

/** Removes (deactivates) a member. Their history stays; they lose access immediately. */
export async function removeMember(
  deps: Deps,
  userId: string,
  familyId: string,
  membershipId: string,
): Promise<void> {
  await requireParent(deps.db, familyId, userId);
  const removedUserId = await deps.db.$transaction(async (tx) => {
    const target = await findActiveMember(tx, familyId, membershipId);
    if (target.role === "PARENT" && (await countActiveParents(tx, familyId)) <= 1) {
      throw lastParent();
    }
    await tx.membership.update({
      where: { id: target.id },
      data: { active: false, pinHash: null, pinFailedAttempts: 0, pinLockedUntil: null },
    });
    // Hand their untouched upcoming chores to the remaining members.
    await replanUntouched(tx, familyId, deps.now());
    const otherFamilies = await tx.membership.count({
      where: { userId: target.userId, active: true },
    });
    return otherFamilies === 0 ? target.userId : null;
  });
  // A user left with no family (e.g. a kid profile) has no reason to stay signed in anywhere.
  if (removedUserId) await revokeAllSessions(deps, removedUserId);
}

/**
 * Hands the device over to a kid profile ("Who's using the tablet?").
 * Parents can switch to any kid in their family. A kid switching to a
 * sibling must enter that sibling's PIN, if one is set. Switching to a parent
 * is not allowed here: parents sign in with their password.
 */
export async function switchToMember(
  deps: Deps,
  callerUserId: string,
  familyId: string,
  membershipId: string,
  pin: string | undefined,
): Promise<AuthResponse> {
  const caller = await requireMember(deps.db, familyId, callerUserId);
  const target = await findActiveMember(deps.db, familyId, membershipId);
  if (target.role !== "CHILD") {
    throw forbidden("CANNOT_SWITCH_TO_PARENT", "Parents sign in with their email and password.");
  }

  const pinNeeded = caller.role !== "PARENT" && target.userId !== caller.userId && target.pinHash;
  if (pinNeeded) {
    await checkPin(deps, target, pin);
  }
  return { user: toUserDto(target.user), tokens: await issueSession(deps, target.userId) };
}

async function checkPin(
  deps: Deps,
  target: { id: string; pinHash: string | null; pinLockedUntil: Date | null },
  pin: string | undefined,
): Promise<void> {
  const now = deps.now();
  if (target.pinLockedUntil && target.pinLockedUntil > now) {
    throw new AppError(
      429,
      "PIN_LOCKED",
      "Too many wrong PINs. Ask a parent, or try again in a few minutes.",
    );
  }
  if (pin === undefined) {
    throw unauthorized("PIN_REQUIRED", "Enter the PIN for this profile.");
  }
  if (target.pinHash && (await verifySecret(target.pinHash, pin))) {
    await deps.db.membership.update({
      where: { id: target.id },
      data: { pinFailedAttempts: 0, pinLockedUntil: null },
    });
    return;
  }
  // Atomic increment so concurrent guesses are all counted.
  const after = await deps.db.membership.update({
    where: { id: target.id },
    data: { pinFailedAttempts: { increment: 1 } },
  });
  if (after.pinFailedAttempts >= PIN_MAX_ATTEMPTS) {
    await deps.db.membership.update({
      where: { id: target.id },
      data: {
        pinFailedAttempts: 0,
        pinLockedUntil: new Date(now.getTime() + PIN_LOCK_MINUTES * 60_000),
      },
    });
  }
  throw unauthorized("INVALID_PIN", "That PIN isn't right.");
}
