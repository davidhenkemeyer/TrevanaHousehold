import {
  CHORE_ACTIONS,
  CHORE_STATUSES,
  DIRECT_ACTIONS,
  PRIORITIES,
  REVIEW_DECISIONS,
  REVIEW_POLICIES,
  isPlainDate,
} from "@titan/domain";
import { z } from "zod";
import { checklistItemSchema } from "./chores.js";
import { idSchema, isoDateTimeSchema } from "./common.js";

export const plainDateSchema = z
  .string()
  .refine(isPlainDate, { message: "Expected a real date as YYYY-MM-DD" });

const personSchema = z.object({
  membershipId: idSchema,
  displayName: z.string(),
  avatarColor: z.string(),
});
export type Person = z.infer<typeof personSchema>;

export const reviewSchema = z.object({
  id: idSchema,
  action: z.enum(REVIEW_DECISIONS),
  note: z.string().nullable(),
  annotations: z.unknown().nullable(),
  /** Null for automatic approvals. */
  reviewer: personSchema.nullable(),
  batch: z.boolean(),
  createdAt: isoDateTimeSchema,
});
export type Review = z.infer<typeof reviewSchema>;

export const submissionSchema = z.object({
  id: idSchema,
  instanceId: idSchema,
  submittedBy: personSchema,
  submittedAt: isoDateTimeSchema,
  checklist: z.array(z.object({ itemId: idSchema, text: z.string(), checked: z.boolean() })),
  /** e.g. { checked: 2, total: 3 } → "2/3 tasks completed". */
  checklistSummary: z.object({ checked: z.int(), total: z.int() }),
  photoCount: z.int(),
  reviews: z.array(reviewSchema),
});
export type Submission = z.infer<typeof submissionSchema>;

/** One dated occurrence, as shown in the Today view and lists. */
export const instanceSchema = z.object({
  id: idSchema,
  choreId: idSchema,
  choreName: z.string(),
  description: z.string(),
  /** Situational trigger, e.g. "After dinner". */
  cue: z.string().nullable(),
  occurrenceDate: plainDateSchema,
  availableAt: isoDateTimeSchema,
  dueAt: isoDateTimeSchema,
  status: z.enum(CHORE_STATUSES),
  isLate: z.boolean(),
  /** Effective priority: HIGH when late or sent back for rework. */
  priority: z.enum(PRIORITIES),
  effortMinutes: z.int(),
  rewardAmount: z.int(),
  requiresPhoto: z.boolean(),
  reviewPolicy: z.enum(REVIEW_POLICIES),
  /** The chore's current checklist, for the submit screen. */
  checklist: z.array(checklistItemSchema),
  assignees: z.array(personSchema),
  /** What the signed-in member can do now (drives buttons and voice prompts). */
  availableActions: z.array(z.enum(CHORE_ACTIONS)),
  /** Most recent parent decision, e.g. rework feedback to show the kid. */
  latestReview: reviewSchema.nullable(),
});
export type Instance = z.infer<typeof instanceSchema>;

export const instanceDetailSchema = instanceSchema.extend({
  submissions: z.array(submissionSchema),
  events: z.array(
    z.object({
      action: z.string(),
      fromStatus: z.enum(CHORE_STATUSES),
      toStatus: z.enum(CHORE_STATUSES),
      /** Null when the system acted. */
      actor: personSchema.nullable(),
      createdAt: isoDateTimeSchema,
    }),
  ),
});
export type InstanceDetail = z.infer<typeof instanceDetailSchema>;

export const instanceParamsSchema = z.object({ familyId: idSchema, instanceId: idSchema });

export const agendaQuerySchema = z.object({
  /** Default: today in the family's time zone. */
  date: plainDateSchema.optional(),
  /** Only this member's chores. Default: everyone's. */
  memberId: idSchema.optional(),
});
export const agendaResponseSchema = z.object({
  date: plainDateSchema,
  items: z.array(instanceSchema),
});
export type AgendaResponse = z.infer<typeof agendaResponseSchema>;

export const instanceListQuerySchema = z.object({
  from: plainDateSchema,
  to: plainDateSchema,
  memberId: idSchema.optional(),
  status: z.enum(CHORE_STATUSES).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const instanceListSchema = z.object({
  items: z.array(instanceSchema),
  nextCursor: z.string().nullable(),
});
export type InstanceList = z.infer<typeof instanceListSchema>;

export const instanceActionBodySchema = z.strictObject({ action: z.enum(DIRECT_ACTIONS) });
export type InstanceActionBody = z.infer<typeof instanceActionBodySchema>;

export const submitBodySchema = z.strictObject({
  /** Items not listed count as unchecked. Partial submissions are allowed. */
  checklist: z
    .array(z.strictObject({ itemId: idSchema, checked: z.boolean() }))
    .max(20)
    .default([]),
});
export type SubmitBody = z.infer<typeof submitBodySchema>;

export const submitResponseSchema = z.object({
  instance: instanceSchema,
  submission: submissionSchema,
});
export type SubmitResponse = z.infer<typeof submitResponseSchema>;

export const replanResponseSchema = z.object({ created: z.int(), removed: z.int() });
export type ReplanResponse = z.infer<typeof replanResponseSchema>;
