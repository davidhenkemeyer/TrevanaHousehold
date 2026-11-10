/**
 * Database rows → API response shapes (see @titan/contracts). Keeping this in
 * one place ensures secrets such as password and PIN hashes are never
 * serialized by accident: only the fields listed here leave the server.
 */
import {
  type Family as FamilyDto,
  type Invite as InviteDto,
  type Member as MemberDto,
  type User as UserDto,
  weeklyCapacitySchema,
} from "@titan/contracts";
import type { Family, Invite, Membership, User } from "../generated/prisma/client.js";

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarColor: user.avatarColor,
  };
}

export function toFamilyDto(family: Family): FamilyDto {
  return {
    id: family.id,
    name: family.name,
    timeZone: family.timeZone,
    createdAt: family.createdAt.toISOString(),
  };
}

export function toMemberDto(membership: Membership & { user: User }): MemberDto {
  return {
    id: membership.id,
    userId: membership.userId,
    displayName: membership.user.displayName,
    avatarColor: membership.user.avatarColor,
    role: membership.role,
    // Stored as JSON; validate on the way out so a bad row fails loudly here.
    capacity: weeklyCapacitySchema.parse(membership.capacity),
    pointsBalance: membership.pointsBalance,
    hasPin: membership.pinHash !== null,
    hasLogin: membership.user.email !== null && membership.user.passwordHash !== null,
  };
}

export function toInviteDto(invite: Invite): InviteDto {
  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
  };
}
