/**
 * Hashing for the two kinds of secrets the API handles:
 *
 *   - Human-chosen secrets (passwords, PINs): argon2id, deliberately slow.
 *   - Random server-issued tokens (refresh tokens, invite tokens): 256 bits of
 *     randomness, so a fast SHA-256 is enough and allows lookup by hash.
 */
import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

export function hashSecret(secret: string): Promise<string> {
  return hash(secret); // argon2id with the library's recommended parameters
}

export async function verifySecret(storedHash: string, secret: string): Promise<boolean> {
  try {
    return await verify(storedHash, secret);
  } catch {
    return false; // malformed hash: treat as a mismatch, never as a crash
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Burns the same time as a real verification. Used when an email has no
 * account, so response timing doesn't reveal which emails are registered.
 */
export async function verifyAgainstDummy(secret: string): Promise<false> {
  dummyHash ??= hash("dummy-password-for-timing");
  await verifySecret(await dummyHash, secret);
  return false;
}

/** A URL-safe random token with 256 bits of entropy. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
