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
} from "@tenara/contracts";
import { type Role, availableActions, effectivePriority, xpFor } from "@tenara/domain";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client.js";
import type { Deps } from "../../deps.js";
import { dbDateToPlain } from "../../lib/dates.js";
import { photoRequired } from "@tenara/domain";
import { planOf, planSelect } from "../plans/service.js";

/** Turns a storage key into a short-lived signed URL. Keys never leave the API. */
export type SignPhoto = (key: string) => Promise<string>;

export function photoSigner(deps: Pick<Deps, "storage" | "now">): SignPhoto {
  return (key) => deps.storage.signedUrl(key, deps.now());
}

const memberWithUser = { include: { user: true } } as const;

export const instanceInclude = {
  // Whether the family is on Pro (photo proof pauses on Basic).
  family: { select: planSelect },
  chore: {
    include: {
      checklist: { orderBy: { position: "asc" } },
      // Who may claim it when it's on the job board (empty = everyone).
      eligible: { select: { membershipId: true } },
    },
  },
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
  /** The request's time, for the family's plan. */
  now: Date;
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

export async function toSubmissionDto(
  submission: SubmissionRow,
  sign: SignPhoto,
): Promise<SubmissionDto> {
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
    photos: await Promise.all(submission.photoKeys.map(async (key) => ({ url: await sign(key) }))),
    photosExpired: submission.photosDeletedAt !== null,
    reviews: submission.reviews.map(toReviewDto),
  };
}

/** A job's pool: the listed members, or everyone when nobody is listed. */
export function inPool(
  eligible: readonly { membershipId: string }[],
  membershipId: string,
): boolean {
  return eligible.length === 0 || eligible.some((e) => e.membershipId === membershipId);
}

export async function toInstanceDto(
  row: InstanceRow,
  viewer: Viewer,
  sign: SignPhoto,
): Promise<Instance> {
  // Photo proof is Pro: on Basic the chore's setting is kept but not asked for.
  const photosAsked = photoRequired(row.chore, planOf(row.family, viewer.now));
  const latestReview = row.submissions[0]?.reviews[0];
  return {
    id: row.id,
    choreId: row.choreId,
    choreName: row.chore.name,
    description: row.chore.description,
    cue: row.chore.cue,
    occurrenceDate: dbDateToPlain(row.occurrenceDate),
    availableAt: row.availableAt.toISOString(),
    dueAt: row.dueAt.toISOString(),
    status: row.status,
    isLate: row.isLate,
    kind: row.chore.kind,
    board: row.board,
    priority: effectivePriority(row.priority, row.status, row.isLate),
    effortMinutes: row.effortMinutes,
    rewardAmount: row.rewardAmount,
    xp: xpFor(row.effortMinutes, row.chore.xpOverride),
    requiresPhoto: photosAsked,
    referencePhotoUrl: row.chore.referencePhotoKey ? await sign(row.chore.referencePhotoKey) : null,
    reviewPolicy: row.chore.reviewPolicy,
    checklist: row.chore.checklist.map((i) => ({ id: i.id, text: i.text })),
    assignees: row.assignees.map((a) => toPerson(a.membership)),
    availableActions: availableActions({
      status: row.status,
      actorRole: viewer.role,
      actorIsAssignee: row.assignees.some((a) => a.membershipId === viewer.membershipId),
      requiresPhoto: photosAsked,
      // The photo is attached in the same request as "complete", so the button
      // shows either way; the app asks for the photo first.
      hasPhoto: false,
      reviewPolicy: row.chore.reviewPolicy,
      board: row.board,
      actorInPool: inPool(row.chore.eligible, viewer.membershipId),
    }),
    latestReview: latestReview ? toReviewDto(latestReview) : null,
  };
}

export async function toInstanceDetailDto(
  row: InstanceRow,
  extras: DetailExtrasRow,
  viewer: Viewer,
  sign: SignPhoto,
): Promise<InstanceDetail> {
  return {
    ...(await toInstanceDto(row, viewer, sign)),
    submissions: await Promise.all(extras.submissions.map((s) => toSubmissionDto(s, sign))),
    events: extras.events.map((e) => ({
      action: e.action,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      actor: e.actor ? toPerson(e.actor) : null,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}
