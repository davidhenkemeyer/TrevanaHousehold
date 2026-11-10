/**
 * Pairing a kid's own phone with their profile.
 *
 *   1. A parent taps "Set up Billy's phone": createPairingCode issues an
 *      8-character code (about 39 bits of randomness), valid for 10 minutes.
 *   2. On Billy's phone, the code is entered: pair() signs the phone in as
 *      Billy, with a normal long-lived session.
 *
 * Codes are single use, stored only as hashes, and replaced when a new one is
 * issued for the same kid. The pair endpoint is rate-limited, so guessing a
 * live code is impractical.
 */
import { randomInt } from "node:crypto";
import {
  type AuthResponse,
  PAIRING_ALPHABET,
  PAIRING_CODE_LENGTH,
  type PairingCodeResponse,
} from "@titan/contracts";
import type { Deps } from "../../deps.js";
import { badRequest, forbidden, notFound } from "../../errors.js";
import { sha256 } from "../../lib/secrets.js";
import { requireParent } from "../access.js";
import { issueSession } from "../auth/sessions.js";
import { toUserDto } from "../dto.js";

export const PAIRING_TTL_MINUTES = 10;

function generateCode(): string {
  let code = "";
  for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
    code += PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)];
  }
  return code;
}

/** "ABCD2345" → "ABCD-2345", easier to read out and type. */
const display = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

export async function createPairingCode(
  deps: Deps,
  userId: string,
  familyId: string,
  membershipId: string,
): Promise<PairingCodeResponse> {
  const parent = await requireParent(deps.db, familyId, userId);
  const target = await deps.db.membership.findFirst({
    where: { id: membershipId, familyId, active: true },
  });
  if (!target) throw notFound("MEMBER_NOT_FOUND", "Family member not found.");
  if (target.role !== "CHILD") {
    throw forbidden(
      "PAIRING_KIDS_ONLY",
      "Parents sign in on their own phones with email and password.",
    );
  }

  const now = deps.now();
  const code = generateCode();
  const expiresAt = new Date(now.getTime() + PAIRING_TTL_MINUTES * 60_000);
  await deps.db.$transaction(async (tx) => {
    // Only the newest code for a kid works.
    await tx.pairingCode.deleteMany({ where: { membershipId, usedAt: null } });
    await tx.pairingCode.create({
      data: {
        membershipId,
        codeHash: sha256(code),
        expiresAt,
        createdById: parent.id,
        createdAt: now,
      },
    });
  });
  return { code: display(code), expiresAt: expiresAt.toISOString() };
}

/** Signs this device in as the kid the code was issued for. `code` is already normalized. */
export async function pair(deps: Deps, code: string): Promise<AuthResponse> {
  const now = deps.now();
  const invalid = () =>
    badRequest(
      "INVALID_PAIRING_CODE",
      "That code isn't valid or has expired. Ask a parent for a new one.",
    );

  const userId = await deps.db.$transaction(async (tx) => {
    const found = await tx.pairingCode.findUnique({
      where: { codeHash: sha256(code) },
      include: { membership: true },
    });
    if (!found || found.usedAt || found.expiresAt <= now || !found.membership.active) {
      throw invalid();
    }
    // Claim it atomically: two phones racing with one code can't both win.
    const claimed = await tx.pairingCode.updateMany({
      where: { id: found.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count === 0) throw invalid();
    return found.membership.userId;
  });

  const user = await deps.db.user.findUniqueOrThrow({ where: { id: userId } });
  return { user: toUserDto(user), tokens: await issueSession(deps, userId) };
}
