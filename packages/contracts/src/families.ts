import { z } from "zod";
import {
  avatarColorSchema,
  displayNameSchema,
  idSchema,
  isoDateTimeSchema,
  pinSchema,
  roleSchema,
  timeZoneSchema,
  weeklyCapacitySchema,
} from "./common.js";

const familyNameSchema = z.string().trim().min(1).max(60);

export const createFamilyBodySchema = z.strictObject({
  name: familyNameSchema,
  timeZone: timeZoneSchema,
});
export type CreateFamilyBody = z.infer<typeof createFamilyBodySchema>;

export const updateFamilyBodySchema = createFamilyBodySchema.partial();
export type UpdateFamilyBody = z.infer<typeof updateFamilyBodySchema>;

export const familySchema = z.object({
  id: idSchema,
  name: z.string(),
  timeZone: z.string(),
  createdAt: isoDateTimeSchema,
});
export type Family = z.infer<typeof familySchema>;

export const memberSchema = z.object({
  /** The membership id: use this to address the member in family-scoped routes. */
  id: idSchema,
  userId: idSchema,
  displayName: z.string(),
  avatarColor: z.string(),
  role: roleSchema,
  capacity: weeklyCapacitySchema,
  pointsBalance: z.int(),
  /** Has a PIN for switching to this member on shared devices. */
  hasPin: z.boolean(),
  /** Member can sign in with email + password (parents, older kids). */
  hasLogin: z.boolean(),
});
export type Member = z.infer<typeof memberSchema>;

export const familyDetailSchema = z.object({
  family: familySchema,
  members: z.array(memberSchema),
});
export type FamilyDetail = z.infer<typeof familyDetailSchema>;

export const createChildBodySchema = z.strictObject({
  displayName: displayNameSchema,
  avatarColor: avatarColorSchema.optional(),
  pin: pinSchema.optional(),
  capacity: weeklyCapacitySchema.optional(),
});
export type CreateChildBody = z.infer<typeof createChildBodySchema>;

export const updateMemberBodySchema = z
  .strictObject({
    displayName: displayNameSchema,
    avatarColor: avatarColorSchema,
    role: roleSchema,
    capacity: weeklyCapacitySchema,
    /** Set a new PIN, or null to remove it. Parents use theirs to take back a shared device. */
    pin: pinSchema.nullable(),
  })
  .partial();
export type UpdateMemberBody = z.infer<typeof updateMemberBodySchema>;

export const switchSessionBodySchema = z.strictObject({
  /**
   * The target's PIN. Needed to switch to any parent, and for a kid switching
   * to a sibling who has a PIN. A parent switching to a kid doesn't need one.
   */
  pin: pinSchema.optional(),
});
export type SwitchSessionBody = z.infer<typeof switchSessionBodySchema>;
