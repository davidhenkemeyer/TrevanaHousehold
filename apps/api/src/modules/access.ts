/**
 * Family-level authorization. Every family-scoped request goes through one of
 * these, which load the caller's *current* membership from the database.
 *
 * A non-member gets 404, not 403, so family ids can't be probed for existence.
 */
import type { Db } from "../db.js";
import { forbidden, notFound } from "../errors.js";
import type { Membership } from "../generated/prisma/client.js";

export async function requireMember(db: Db, familyId: string, userId: string): Promise<Membership> {
  const membership = await db.membership.findUnique({
    where: { familyId_userId: { familyId, userId } },
  });
  if (!membership?.active) {
    throw notFound("FAMILY_NOT_FOUND", "Family not found.");
  }
  return membership;
}

export async function requireParent(db: Db, familyId: string, userId: string): Promise<Membership> {
  const membership = await requireMember(db, familyId, userId);
  if (membership.role !== "PARENT") {
    throw forbidden("PARENT_REQUIRED", "Only a parent can do that.");
  }
  return membership;
}
