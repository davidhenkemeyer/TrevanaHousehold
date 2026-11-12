import type {
  LoginBody,
  MeResponse,
  SignupBody,
  UpdateMeBody,
  User as UserDto,
} from "@tenara/contracts";
import { defaultAvatarColor } from "@tenara/domain";
import type { Deps } from "../../deps.js";
import { conflict, isUniqueViolation, notFound, unauthorized } from "../../errors.js";
import { hashSecret, verifyAgainstDummy, verifySecret } from "../../lib/secrets.js";
import { toUserDto } from "../dto.js";
import {
  type IssuedAuth,
  type IssuedTokens,
  issueSession,
  revokeSession,
  rotateSession,
} from "./sessions.js";

export async function signup(deps: Deps, body: SignupBody): Promise<IssuedAuth> {
  const passwordHash = await hashSecret(body.password);
  try {
    const user = await deps.db.user.create({
      data: {
        email: body.email,
        passwordHash,
        displayName: body.displayName,
        avatarColor: defaultAvatarColor(0),
      },
    });
    return { user: toUserDto(user), tokens: await issueSession(deps, user.id) };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict("EMAIL_TAKEN", "An account with that email already exists. Try signing in.");
    }
    throw error;
  }
}

export async function login(deps: Deps, body: LoginBody): Promise<IssuedAuth> {
  const user = await deps.db.user.findUnique({ where: { email: body.email } });
  const ok = user?.passwordHash
    ? await verifySecret(user.passwordHash, body.password)
    : await verifyAgainstDummy(body.password);
  if (!user || !ok) {
    // Same message either way: don't reveal which emails have accounts.
    throw unauthorized("INVALID_CREDENTIALS", "Email or password is incorrect.");
  }
  return { user: toUserDto(user), tokens: await issueSession(deps, user.id) };
}

export function refresh(deps: Deps, refreshToken: string): Promise<IssuedTokens> {
  return rotateSession(deps, refreshToken);
}

export function logout(deps: Deps, refreshToken: string): Promise<void> {
  return revokeSession(deps, refreshToken);
}

export async function getMe(deps: Deps, userId: string): Promise<MeResponse> {
  const user = await deps.db.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        where: { active: true },
        include: { family: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!user) throw notFound("USER_NOT_FOUND", "Account not found.");
  return {
    user: toUserDto(user),
    memberships: user.memberships.map((m) => ({
      membershipId: m.id,
      familyId: m.familyId,
      familyName: m.family.name,
      role: m.role,
    })),
  };
}

export async function updateMe(deps: Deps, userId: string, body: UpdateMeBody): Promise<UserDto> {
  const user = await deps.db.user.update({
    where: { id: userId },
    data: {
      ...(body.displayName !== undefined && { displayName: body.displayName }),
      ...(body.avatarColor !== undefined && { avatarColor: body.avatarColor }),
    },
  });
  return toUserDto(user);
}
