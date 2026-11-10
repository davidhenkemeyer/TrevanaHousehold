/**
 * Sessions = a short-lived access token (JWT) + a long-lived refresh token.
 *
 * Refresh tokens are single-use: every refresh revokes the old token and
 * issues a new one. If an already-used token shows up again, someone else has
 * a copy, so every session of that user is revoked (refresh-token reuse
 * detection, per OAuth 2.0 security best practice).
 */
import type { Tokens } from "@chores/contracts";
import type { Deps } from "../../deps.js";
import { unauthorized } from "../../errors.js";
import { randomToken, sha256 } from "../../lib/secrets.js";

const MS_PER_DAY = 86_400_000;

type TxOrDb = Pick<Deps["db"], "refreshToken">;

async function createRefreshToken(deps: Deps, db: TxOrDb, userId: string, now: Date) {
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + deps.config.refreshTokenTtlDays * MS_PER_DAY);
  const row = await db.refreshToken.create({
    data: { userId, tokenHash: sha256(token), expiresAt, createdAt: now },
  });
  return { token, expiresAt, id: row.id };
}

async function toTokens(
  deps: Deps,
  userId: string,
  now: Date,
  refresh: { token: string; expiresAt: Date },
): Promise<Tokens> {
  const access = await deps.accessTokens.sign(userId, now);
  return {
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt.toISOString(),
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
  };
}

/** Starts a new session for a user (sign-up, login, profile switch). */
export async function issueSession(deps: Deps, userId: string): Promise<Tokens> {
  const now = deps.now();
  const refresh = await createRefreshToken(deps, deps.db, userId, now);
  return toTokens(deps, userId, now, refresh);
}

const invalidRefresh = () =>
  unauthorized("INVALID_REFRESH_TOKEN", "Your session has ended. Sign in again.");

/** Exchanges a refresh token for a new token pair. */
export async function rotateSession(deps: Deps, refreshToken: string): Promise<Tokens> {
  const now = deps.now();
  const existing = await deps.db.refreshToken.findUnique({
    where: { tokenHash: sha256(refreshToken) },
  });
  if (!existing) throw invalidRefresh();

  if (existing.revokedAt) {
    await revokeAllSessions(deps, existing.userId);
    throw invalidRefresh();
  }
  if (existing.expiresAt <= now) throw invalidRefresh();

  const fresh = await deps.db.$transaction(async (tx) => {
    // Conditional update: if two requests race with the same token, only one
    // wins; the loser is treated as reuse below.
    const claimed = await tx.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: now },
    });
    if (claimed.count === 0) return null;
    const next = await createRefreshToken(deps, tx, existing.userId, now);
    await tx.refreshToken.update({ where: { id: existing.id }, data: { replacedById: next.id } });
    return next;
  });
  if (!fresh) {
    await revokeAllSessions(deps, existing.userId);
    throw invalidRefresh();
  }
  return toTokens(deps, existing.userId, now, fresh);
}

/** Ends one session. Unknown or already-revoked tokens are ignored (logout is idempotent). */
export async function revokeSession(deps: Deps, refreshToken: string): Promise<void> {
  await deps.db.refreshToken.updateMany({
    where: { tokenHash: sha256(refreshToken), revokedAt: null },
    data: { revokedAt: deps.now() },
  });
}

export async function revokeAllSessions(deps: Deps, userId: string): Promise<void> {
  await deps.db.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: deps.now() },
  });
}
