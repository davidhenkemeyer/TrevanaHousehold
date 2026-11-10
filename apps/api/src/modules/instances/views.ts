/**
 * How chore instances are loaded (Prisma includes) and shaped for the API.
 * Every endpoint that returns instances uses these, so the shapes stay identical.
 */
import type {
  Instance,
  InstanceDetail,
  Person,
  Review as ReviewDto,
  Submission as SubmissionDto,
} from "@chores/contracts";
import { type Role, availableActions, effectivePriority } from "@chores/domain";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client.js";
import { dbDateToPlain } from "../../lib/dates.js";

const memberWithUser = { include: { user: true } } as const;

export const instanceInclude = {
  chore: { include: { checklist: { orderBy: { position: "asc" } } } },
  assignees: { include: { membership: memberWithUser }, orderBy: { membershipId: "asc" } },
  // Latest submission and its latest review, for "feedback from Mom".
  submissions: {
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    take: 1,
    include: {
      reviews: { orderBy: { createdAt: "desc" }, take: 1, include: { reviewer: memberWithUser } },
    },
  },
} as const satisfies Prisma.ChoreInstanceInclude;
export type InstanceRow = Prisma.ChoreInstanceGetPayload<{ include: typeof instanceInclude }>;

export const submissionInclude = {
  submittedBy: memberWithUser,
  reviews: { orderBy: { createdAt: "asc" }, include: { reviewer: memberWithUser } },
} as const satisfies Prisma.SubmissionInclude;
export type SubmissionRow = Prisma.SubmissionGetPayload<{ include: typeof submissionInclude }>;

/** Full history: every submission with its reviews, and every status change. */
export const detailExtras = {
  submissions: { orderBy: [{ submittedAt: "asc" }, { id: "asc" }], include: submissionInclude },
  events: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { actor: memberWithUser } },
} as const satisfies Prisma.ChoreInstanceInclude;
export type DetailExtrasRow = Prisma.ChoreInstanceGetPayload<{ include: typeof detailExtras }>;

/** Who is looking, for computing their available actions. */
export interface Viewer {
  membershipId: string;
  role: Role;
}

type MemberWithUser = Prisma.MembershipGetPayload<typeof memberWithUser>;

export function toPerson(m: MemberWithUser): Person {
  return { membershipId: m.id, displayName: m.user.displayName, avatarColor: m.user.avatarColor };
}

type ReviewRow = Prisma.ReviewGetPayload<{ include: { reviewer: typeof memberWithUser } }>;

export function toReviewDto(review: ReviewRow): ReviewDto {
  return {
    id: review.id,
    action: review.action,
    note: review.note,
    annotations: review.annotations ?? null,
    reviewer: review.reviewer ? toPerson(review.reviewer) : null,
    batch: review.batch,
    createdAt: review.createdAt.toISOString(),
  };
}

export const checklistStateSchema = z.array(
  z.object({ itemId: z.string(), text: z.string(), checked: z.boolean() }),
);

export function toSubmissionDto(submission: SubmissionRow): SubmissionDto {
  const checklist = checklistStateSchema.parse(submission.checklistState);
  return {
    id: submission.id,
    instanceId: submission.instanceId,
    submittedBy: toPerson(submission.submittedBy),
    submittedAt: submission.submittedAt.toISOString(),
    checklist,
    checklistSummary: {
      checked: checklist.filter((i) => i.checked).length,
      total: checklist.length,
    },
    photoCount: submission.photoKeys.length,
    reviews: submission.reviews.map(toReviewDto),
  };
}

export function toInstanceDto(row: InstanceRow, viewer: Viewer): Instance {
  const latestReview = row.submissions[0]?.reviews[0];
  return {
    id: row.id,
    choreId: row.choreId,
    choreName: row.chore.name,
    description: row.chore.description,
    occurrenceDate: dbDateToPlain(row.occurrenceDate),
    availableAt: row.availableAt.toISOString(),
    dueAt: row.dueAt.toISOString(),
    status: row.status,
    isLate: row.isLate,
    priority: effectivePriority(row.priority, row.status, row.isLate),
    effortMinutes: row.effortMinutes,
    rewardAmount: row.rewardAmount,
    requiresPhoto: row.chore.requiresPhoto,
    reviewPolicy: row.chore.reviewPolicy,
    checklist: row.chore.checklist.map((i) => ({ id: i.id, text: i.text })),
    assignees: row.assignees.map((a) => toPerson(a.membership)),
    availableActions: availableActions({
      status: row.status,
      actorRole: viewer.role,
      actorIsAssignee: row.assignees.some((a) => a.membershipId === viewer.membershipId),
      requiresPhoto: row.chore.requiresPhoto,
      hasPhoto: false, // photos arrive in Step 7; "complete" is still listed when only the photo is missing
      reviewPolicy: row.chore.reviewPolicy,
    }),
    latestReview: latestReview ? toReviewDto(latestReview) : null,
  };
}

export function toInstanceDetailDto(
  row: InstanceRow,
  extras: DetailExtrasRow,
  viewer: Viewer,
): InstanceDetail {
  return {
    ...toInstanceDto(row, viewer),
    submissions: extras.submissions.map(toSubmissionDto),
    events: extras.events.map((e) => ({
      action: e.action,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      actor: e.actor ? toPerson(e.actor) : null,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}
