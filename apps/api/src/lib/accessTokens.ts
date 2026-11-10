/**
 * Short-lived access tokens: HS256 JWTs carrying only the user id. Everything
 * else (family membership, role) is looked up per request, so removing a
 * member or changing a role takes effect immediately.
 */
import { SignJWT, jwtVerify } from "jose";

const ISSUER = "chores-api";
const AUDIENCE = "chores-clients";

export interface AccessTokenService {
  sign(userId: string, now: Date): Promise<{ token: string; expiresAt: Date }>;
  /** Returns the user id, or null if the token is invalid or expired. */
  verify(token: string, now: Date): Promise<string | null>;
}

export function createAccessTokenService(secret: string, ttlSeconds: number): AccessTokenService {
  const key = new TextEncoder().encode(secret);
  return {
    async sign(userId, now) {
      const issuedAt = Math.floor(now.getTime() / 1000);
      const expiresAtSeconds = issuedAt + ttlSeconds;
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setSubject(userId)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt(issuedAt)
        .setExpirationTime(expiresAtSeconds)
        .sign(key);
      return { token, expiresAt: new Date(expiresAtSeconds * 1000) };
    },
    async verify(token, now) {
      try {
        const { payload } = await jwtVerify(token, key, {
          issuer: ISSUER,
          audience: AUDIENCE,
          algorithms: ["HS256"],
          currentDate: now,
        });
        return typeof payload.sub === "string" ? payload.sub : null;
      } catch {
        return null;
      }
    },
  };
}
