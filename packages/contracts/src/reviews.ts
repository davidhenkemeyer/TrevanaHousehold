import { REVIEW_DECISIONS, REVIEW_POLICIES } from "@titan/domain";
import { z } from "zod";
import { idSchema } from "./common.js";
import { instanceSchema, plainDateSchema, reviewSchema, submissionSchema } from "./instances.js";

/** A numbered pin dropped on the submitted photo (positions are % of width/height). */
export const annotationPinSchema = z.strictObject({
  pin: z.int().min(1).max(20),
  xPercent: z.number().min(0).max(100),
  yPercent: z.number().min(0).max(100),
  comment: z.string().trim().min(1).max(60),
});

export const annotationsSchema = z
  .strictObject({ pins: z.array(annotationPinSchema).min(1).max(20) })
  .refine((a) => new Set(a.pins.map((p) => p.pin)).size === a.pins.length, {
    message: "Pin numbers must be unique",
    path: ["pins"],
  });
export type Annotations = z.infer<typeof annotationsSchema>;

export const reviewBodySchema = z.strictObject({
  action: z.enum(REVIEW_DECISIONS),
  note: z.string().trim().min(1).max(500).optional(),
  annotations: annotationsSchema.optional(),
});
export type ReviewBody = z.infer<typeof reviewBodySchema>;

export const reviewResponseSchema = z.object({ instance: instanceSchema, review: reviewSchema });
export type ReviewResponse = z.infer<typeof reviewResponseSchema>;

export const submissionParamsSchema = z.object({ familyId: idSchema, submissionId: idSchema });

export const reviewQueueQuerySchema = z.object({
  memberId: idSchema.optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const reviewQueueItemSchema = z.object({
  submission: submissionSchema,
  instance: z.object({
    id: idSchema,
    choreId: idSchema,
    choreName: z.string(),
    occurrenceDate: plainDateSchema,
    isLate: z.boolean(),
    rewardAmount: z.int(),
    reviewPolicy: z.enum(REVIEW_POLICIES),
  }),
  /** Included by "Approve all low-stakes". */
  batchEligible: z.boolean(),
});
export type ReviewQueueItem = z.infer<typeof reviewQueueItemSchema>;

export const reviewQueueSchema = z.object({
  /** All pending submissions matching the filter, across pages. */
  total: z.int(),
  items: z.array(reviewQueueItemSchema),
  nextCursor: z.string().nullable(),
});
export type ReviewQueue = z.infer<typeof reviewQueueSchema>;

export const batchApproveBodySchema = z.strictObject({
  submissionIds: z.array(idSchema).min(1).max(100),
});
export type BatchApproveBody = z.infer<typeof batchApproveBodySchema>;

export const batchApproveResponseSchema = z.object({
  results: z.array(
    z.object({
      submissionId: idSchema,
      ok: z.boolean(),
      /** Why it wasn't approved, e.g. REVIEW_INDIVIDUALLY. */
      code: z.string().optional(),
      message: z.string().optional(),
    }),
  ),
});
export type BatchApproveResponse = z.infer<typeof batchApproveResponseSchema>;
