/**
 * Email invitations to join a family (a second parent, or an older kid with
 * their own login). The invite token is a 256-bit secret shown once to the
 * inviting parent; only its hash is stored. The invitee must be signed in with
 * the invited email address to accept.
 */
import type {
  AcceptInviteResponse,
  CreateInviteBody,
  CreateInviteResponse,
  InviteList,
} from "@titan/contracts";
import { defaultWeeklyCapacity } from "@titan/domain";
import type { Deps } from "../../deps.js";
import { badRequest, conflict, forbidden, notFound } from "../../errors.js";
import { randomToken, sha256 } from "../../lib/secrets.js";
import { requireParent } from "../access.js";
import { toInviteDto } from "../dto.js";

const MS_PER_DAY = 86_400_000;

/** Where clause for invites that can still be accepted. */
const pending = (now: Date) => ({ acceptedAt: null, revokedAt: null, expiresAt: { gt: now } });

export async function createInvite(
  deps: Deps,
  userId: string,
  familyId: string,
  body: CreateInviteBody,
): Promise<CreateInviteResponse> {
  await requireParent(deps.db, familyId, userId);
  const now = deps.now();

  const existingMember = await deps.db.membership.findFirst({
    where: { familyId, active: true, user: { email: body.email } },
  });
  if (existingMember) {
    throw conflict("ALREADY_MEMBER", "That person is already in this family.");
  }

  const token = randomToken();
  const invite = await deps.db.$transaction(async (tx) => {
    // A new invite replaces any earlier pending one for the same address.
    await tx.invite.updateMany({
      where: { familyId, email: body.email, ...pending(now) },
      data: { revokedAt: now },
    });
    return tx.invite.create({
      data: {
        familyId,
        email: body.email,
        role: body.role,
        tokenHash: sha256(token),
        expiresAt: new Date(now.getTime() + deps.config.inviteTtlDays * MS_PER_DAY),
        createdByUserId: userId,
        createdAt: now,
      },
    });
  });
  return { invite: toInviteDto(invite), token };
}

export async function listInvites(
  deps: Deps,
  userId: string,
  familyId: string,
): Promise<InviteList> {
  await requireParent(deps.db, familyId, userId);
  const invites = await deps.db.invite.findMany({
    where: { familyId, ...pending(deps.now()) },
    orderBy: { createdAt: "desc" },
  });
  return { invites: invites.map(toInviteDto) };
}

export async function revokeInvite(
  deps: Deps,
  userId: string,
  familyId: string,
  inviteId: string,
): Promise<void> {
  await requireParent(deps.db, familyId, userId);
  const result = await deps.db.invite.updateMany({
    where: { id: inviteId, familyId, ...pending(deps.now()) },
    data: { revokedAt: deps.now() },
  });
  if (result.count === 0) throw notFound("INVITE_NOT_FOUND", "No pending invite with that id.");
}

const invalidInvite = () =>
  badRequest("INVALID_INVITE", "This invite link is invalid or has expired. Ask for a new one.");

export async function acceptInvite(
  deps: Deps,
  userId: string,
  token: string,
): Promise<AcceptInviteResponse> {
  const now = deps.now();
  const invite = await deps.db.invite.findUnique({ where: { tokenHash: sha256(token) } });
  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt <= now) {
    throw invalidInvite();
  }
  const user = await deps.db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.email !== invite.email) {
    throw forbidden(
      "INVITE_EMAIL_MISMATCH",
      "This invite is for a different email address. Sign in with that address to accept it.",
    );
  }

  const membership = await deps.db.$transaction(async (tx) => {
    // Claim the invite atomically so it can only be used once.
    const claimed = await tx.invite.updateMany({
      where: { id: invite.id, ...pending(now) },
      data: { acceptedAt: now, acceptedByUserId: userId },
    });
    if (claimed.count === 0) throw invalidInvite();

    const existing = await tx.membership.findUnique({
      where: { familyId_userId: { familyId: invite.familyId, userId } },
    });
    if (existing?.active) {
      throw conflict("ALREADY_MEMBER", "You're already in this family.");
    }
    if (existing) {
      // Rejoining after being removed: keep their old capacity and points.
      return tx.membership.update({
        where: { id: existing.id },
        data: { active: true, role: invite.role },
      });
    }
    return tx.membership.create({
      data: {
        familyId: invite.familyId,
        userId,
        role: invite.role,
        capacity: defaultWeeklyCapacity(invite.role),
      },
    });
  });
  return { familyId: membership.familyId, membershipId: membership.id };
}
