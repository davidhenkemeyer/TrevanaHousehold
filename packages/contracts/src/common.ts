/**
 * Building-block schemas reused across the API contract.
 *
 * Input schemas normalize as they validate (e.g. emails are trimmed and
 * lowercased), so the API and every client agree on one canonical form.
 */
import { ROLES, isValidTimeZone } from "@titan/domain";
import { z } from "zod";

export const idSchema = z.uuid();

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** Length is what matters for passwords; no composition rules (per NIST SP 800-63B). */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters");

export const displayNameSchema = z.string().trim().min(1).max(40);

/** Kid profile PIN: 4–6 digits. */
export const pinSchema = z.string().regex(/^\d{4,6}$/, "PIN must be 4 to 6 digits");

export const timeZoneSchema = z.string().refine(isValidTimeZone, {
  message: "Unknown time zone (use an IANA name like America/Chicago)",
});

export const avatarColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a hex value like #2563EB");

export const roleSchema = z.enum(ROLES);

const minutesPerDay = z.int().min(0).max(1440);

/** Minutes of chore time per weekday. */
export const weeklyCapacitySchema = z.strictObject({
  sun: minutesPerDay,
  mon: minutesPerDay,
  tue: minutesPerDay,
  wed: minutesPerDay,
  thu: minutesPerDay,
  fri: minutesPerDay,
  sat: minutesPerDay,
});

export const isoDateTimeSchema = z.iso.datetime();

/** Every error response has this shape. `code` is stable; `message` is for humans. */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** Route params for family-scoped endpoints. */
export const familyParamsSchema = z.object({ familyId: idSchema });
export const memberParamsSchema = z.object({ familyId: idSchema, membershipId: idSchema });
