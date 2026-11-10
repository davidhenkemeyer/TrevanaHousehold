import { z } from "zod";
import { isoDateTimeSchema } from "./common.js";

/** Letters and digits that can't be confused when read aloud or typed (no 0/O, 1/I/L, U/V). */
export const PAIRING_ALPHABET = "ABCDEFGHJKMNPQRSTWXYZ23456789";
export const PAIRING_CODE_LENGTH = 8;

/** Accepts "abcd-2345", "ABCD 2345", "abcd2345"; normalizes to "ABCD2345". */
export function normalizePairingCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

export const pairingCodeResponseSchema = z.object({
  /** Shown to the parent as XXXX-XXXX; typed on the kid's phone. */
  code: z.string(),
  expiresAt: isoDateTimeSchema,
});
export type PairingCodeResponse = z.infer<typeof pairingCodeResponseSchema>;

export const pairBodySchema = z.strictObject({
  code: z
    .string()
    .max(20)
    .transform(normalizePairingCode)
    .pipe(
      z
        .string()
        .length(PAIRING_CODE_LENGTH, "Pairing codes have 8 characters")
        .regex(new RegExp(`^[${PAIRING_ALPHABET}]+$`), "That doesn't look like a pairing code"),
    ),
});
export type PairBody = z.infer<typeof pairBodySchema>;
