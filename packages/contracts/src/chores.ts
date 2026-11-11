import {
  ASSIGN_MODES,
  CHORE_KINDS,
  FREQUENCIES,
  MAX_XP_OVERRIDE,
  PRIORITIES,
  REVIEW_POLICIES,
  type RecurrenceRule,
  validateRecurrenceRule,
} from "@titan/domain";
import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.js";

/** Drops undefined keys so the result satisfies RecurrenceRule under exactOptionalPropertyTypes. */
export function toRecurrenceRule(input: z.infer<typeof recurrenceShape>): RecurrenceRule {
  return Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== undefined),
  ) as unknown as RecurrenceRule;
}

const recurrenceShape = z.strictObject({
  freq: z.enum(FREQUENCIES),
  interval: z.int().optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  byWeekday: z.array(z.int()).optional(),
  byMonthDay: z.int().optional(),
  timeOfDay: z.string().optional(),
});

/** A recurrence rule, validated by the same function the scheduler uses. */
export const recurrenceSchema = recurrenceShape.superRefine((rule, ctx) => {
  for (const message of validateRecurrenceRule(toRecurrenceRule(rule))) {
    ctx.addIssue({ code: "custom", message });
  }
});
export type Recurrence = z.infer<typeof recurrenceSchema>;

const MAX_DEADLINE_MINUTES = 90 * 24 * 60;

/** Field schemas shared by create (with defaults) and update (all optional). */
const fields = {
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500),
  /** Situational trigger shown on the card, e.g. "After dinner". Null removes it. */
  cue: z.string().trim().min(1).max(60).nullable(),
  /** Routine (baseline duty) or extra job (optional, earns coins). */
  kind: z.enum(CHORE_KINDS),
  /** XP for approving it. Null: from effort (1 per minute, at least 5). */
  xpOverride: z.int().min(1).max(MAX_XP_OVERRIDE).nullable(),
  effortMinutes: z.int().min(1).max(480),
  defaultPriority: z.enum(PRIORITIES),
  requiresPhoto: z.boolean(),
  reviewPolicy: z.enum(REVIEW_POLICIES),
  /** In the family's reward currency: cents for money, points for points. */
  rewardAmount: z.int().min(0).max(1_000_000),
  recurrence: recurrenceSchema,
  /** Due this long after the occurrence becomes available. Max 90 days. */
  deadlineMinutes: z.int().min(1).max(MAX_DEADLINE_MINUTES),
  assignMode: z.enum(ASSIGN_MODES),
  /**
   * FIXED: owners. ROTATE/AUTO: candidate pool in rotation order (empty = everyone).
   * OPEN (job board): who may claim it (empty = everyone).
   */
  eligibleMembershipIds: z
    .array(idSchema)
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length, "Members must not repeat"),
  /** Checklist item texts, in order. Replaces the whole checklist on update. */
  checklist: z.array(z.string().trim().min(1).max(120)).max(20),
};

export const createChoreBodySchema = z
  .strictObject({
    name: fields.name,
    description: fields.description.default(""),
    cue: fields.cue.default(null),
    kind: fields.kind.default("ROUTINE"),
    xpOverride: fields.xpOverride.default(null),
    effortMinutes: fields.effortMinutes,
    defaultPriority: fields.defaultPriority.default("NORMAL"),
    requiresPhoto: fields.requiresPhoto.default(false),
    reviewPolicy: fields.reviewPolicy.default("REVIEW_EACH"),
    rewardAmount: fields.rewardAmount.default(0),
    recurrence: fields.recurrence,
    deadlineMinutes: fields.deadlineMinutes,
    assignMode: fields.assignMode,
    eligibleMembershipIds: fields.eligibleMembershipIds.default([]),
    checklist: fields.checklist.default([]),
    /** From POST /uploads (purpose REFERENCE). */
    referencePhotoUploadId: idSchema.optional(),
  })
  .refine((c) => c.assignMode !== "FIXED" || c.eligibleMembershipIds.length > 0, {
    message: "A FIXED chore needs at least one owner",
    path: ["eligibleMembershipIds"],
  });
export type CreateChoreBody = z.infer<typeof createChoreBodySchema>;

export const updateChoreBodySchema = z.strictObject({
  name: fields.name.optional(),
  description: fields.description.optional(),
  cue: fields.cue.optional(),
  kind: fields.kind.optional(),
  xpOverride: fields.xpOverride.optional(),
  effortMinutes: fields.effortMinutes.optional(),
  defaultPriority: fields.defaultPriority.optional(),
  requiresPhoto: fields.requiresPhoto.optional(),
  reviewPolicy: fields.reviewPolicy.optional(),
  rewardAmount: fields.rewardAmount.optional(),
  recurrence: fields.recurrence.optional(),
  deadlineMinutes: fields.deadlineMinutes.optional(),
  assignMode: fields.assignMode.optional(),
  eligibleMembershipIds: fields.eligibleMembershipIds.optional(),
  checklist: fields.checklist.optional(),
  /** A new reference photo (from POST /uploads, purpose REFERENCE), or null to remove it. */
  referencePhotoUploadId: idSchema.nullable().optional(),
});
export type UpdateChoreBody = z.infer<typeof updateChoreBodySchema>;

export const checklistItemSchema = z.object({ id: idSchema, text: z.string() });
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const choreSchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string(),
  cue: z.string().nullable(),
  kind: z.enum(CHORE_KINDS),
  xpOverride: z.int().nullable(),
  effortMinutes: z.int(),
  defaultPriority: z.enum(PRIORITIES),
  requiresPhoto: z.boolean(),
  reviewPolicy: z.enum(REVIEW_POLICIES),
  rewardAmount: z.int(),
  recurrence: recurrenceShape,
  deadlineMinutes: z.int(),
  assignMode: z.enum(ASSIGN_MODES),
  eligibleMembershipIds: z.array(idSchema),
  checklist: z.array(checklistItemSchema),
  /** Signed URL of the reference ("golden standard") photo. */
  referencePhotoUrl: z.string().nullable(),
  active: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Chore = z.infer<typeof choreSchema>;

export const choreListSchema = z.object({ chores: z.array(choreSchema) });
export type ChoreList = z.infer<typeof choreListSchema>;

export const choreParamsSchema = z.object({ familyId: idSchema, choreId: idSchema });

export const choreListQuerySchema = z.object({
  includeArchived: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});
