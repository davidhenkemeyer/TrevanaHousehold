/**
 * Parent review of submissions: the approval queue, individual decisions
 * (approve / request rework / reject), and "Approve all low-stakes".
 */
import type {
  BatchApproveResponse,
  ReviewBody,
  ReviewQueue,
  ReviewResponse,
} from "@titan/contracts";
import { REVIEW_DECISION_ACTION, canBatchApprove } from "@titan/domain";
import { z } from "zod";
import type { Deps } from "../../deps.js";
import { AppError, badRequest, conflict, notFound } from "../../errors.js";
import type { Membership, Prisma } from "../../generated/prisma/client.js";
import { decodeCursor, encodeCursor } from "../../lib/cursor.js";
import { dbDateToPlain } from "../../lib/dates.js";
import { requireParent } from "../access.js";
import { loadInstance } from "../instances/service.js";
import { transition } from "../instances/transitions.js";
import {
  photoSigner,
  submissionInclude,
  toReviewDto,
  toSubmissionDto,
} from "../instances/views.js";

type Tx = Prisma.TransactionClient;

/** Submissions waiting for a decision: no review yet, and the instance is still pending. */
const pendingWhere = (familyId: string, memberId?: string): Prisma.SubmissionWhereInput => ({
  reviews: { none: {} },
  instance: {
    familyId,
    status: "PENDING_REVIEW",
    ...(memberId !== undefined && { assignees: { some: { membershipId: memberId } } }),
  },
});

const queueCursorSchema = z.object({ t: z.string(), id: z.string() });

export async function getReviewQueue(
  deps: Deps,
  userId: string,
  familyId: string,
  query: { memberId?: string | undefined; cursor?: string | undefined; limit: number },
): Promise<ReviewQueue> {
  await requireParent(deps.db, familyId, userId);
  const after = decodeCursor(query.cursor, queueCursorSchema);
  const where = pendingWhere(familyId, query.memberId);

  const [total, rows] = await Promise.all([
    deps.db.submission.count({ where }),
    deps.db.submission.findMany({
      where: {
        ...where,
        ...(after && {
          OR: [
            { submittedAt: { lt: new Date(after.t) } },
            { submittedAt: new Date(after.t), id: { lt: after.id } },
          ],
        }),
      },
      // Newest first, per the spec's card stream.
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      include: {
        ...submissionInclude,
        instance: {
          include: {
            chore: { select: { name: true, reviewPolicy: true, referencePhotoKey: true } },
          },
        },
      },
    }),
  ]);

  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  const sign = photoSigner(deps);
  const items = await Promise.all(
    page.map(async (s) => ({
      submission: await toSubmissionDto(s, sign),
      instance: {
        id: s.instance.id,
        choreId: s.instance.choreId,
        choreName: s.instance.chore.name,
        occurrenceDate: dbDateToPlain(s.instance.occurrenceDate),
        isLate: s.instance.isLate,
        rewardAmount: s.instance.rewardAmount,
        reviewPolicy: s.instance.chore.reviewPolicy,
        referencePhotoUrl: s.instance.chore.referencePhotoKey
          ? await sign(s.instance.chore.referencePhotoKey)
          : null,
      },
      batchEligible: canBatchApprove(s.instance.status, s.instance.chore.reviewPolicy),
    })),
  );
  return {
    total,
    items,
    nextCursor:
      rows.length > query.limit && last
        ? encodeCursor({ t: last.submittedAt.toISOString(), id: last.id })
        : null,
  };
}

async function decide(
  tx: Tx,
  deps: Deps,
  parent: Membership,
  familyId: string,
  submissionId: string,
  body: ReviewBody,
  batch: boolean,
) {
  const submission = await tx.submission.findFirst({
    where: { id: submissionId, instance: { familyId } },
    include: {
      reviews: { select: { id: true } },
      instance: {
        select: {
          status: true,
          chore: { select: { reviewPolicy: true } },
          submissions: {
            orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
            take: 1,
            select: { id: true },
          },
        },
      },
    },
  });
  if (!submission) throw notFound("SUBMISSION_NOT_FOUND", "Submission not found.");
  if (submission.reviews.length > 0 || submission.instance.submissions[0]?.id !== submission.id) {
    throw conflict(
      "ALREADY_REVIEWED",
      "This submission was already reviewed, or a newer one replaced it.",
    );
  }
  if (
    batch &&
    !canBatchApprove(submission.instance.status, submission.instance.chore.reviewPolicy)
  ) {
    throw new AppError(
      409,
      "REVIEW_INDIVIDUALLY",
      "This chore's settings require reviewing each submission individually.",
    );
  }
  if (body.annotations && submission.photoKeys.length === 0) {
    throw badRequest("ANNOTATIONS_NEED_PHOTO", "Pins can only be placed on a submitted photo.");
  }

  const now = deps.now();
  await transition(tx, {
    familyId,
    instanceId: submission.instanceId,
    action: REVIEW_DECISION_ACTION[body.action],
    actor: parent,
    now,
  });
  const review = await tx.review.create({
    data: {
      submissionId,
      reviewerId: parent.id,
      action: body.action,
      note: body.note ?? null,
      ...(body.annotations && { annotations: body.annotations }),
      batch,
      createdAt: now,
    },
    include: { reviewer: { include: { user: true } } },
  });
  return { instanceId: submission.instanceId, review };
}

export async function reviewSubmission(
  deps: Deps,
  userId: string,
  familyId: string,
  submissionId: string,
  body: ReviewBody,
): Promise<ReviewResponse> {
  const parent = await requireParent(deps.db, familyId, userId);
  return deps.db.$transaction(async (tx) => {
    const { instanceId, review } = await decide(
      tx,
      deps,
      parent,
      familyId,
      submissionId,
      body,
      false,
    );
    return {
      instance: await loadInstance(
        tx,
        familyId,
        instanceId,
        { membershipId: parent.id, role: "PARENT" },
        photoSigner(deps),
      ),
      review: toReviewDto(review),
    };
  });
}

/**
 * "Approve all low-stakes": approves each listed submission on its own, so one
 * that can't be approved (needs individual review, already handled) doesn't
 * block the rest. Results come back per submission.
 */
export async function batchApprove(
  deps: Deps,
  userId: string,
  familyId: string,
  submissionIds: readonly string[],
): Promise<BatchApproveResponse> {
  const parent = await requireParent(deps.db, familyId, userId);
  const results: BatchApproveResponse["results"] = [];
  for (const submissionId of new Set(submissionIds)) {
    try {
      await deps.db.$transaction((tx) =>
        decide(tx, deps, parent, familyId, submissionId, { action: "APPROVE" }, true),
      );
      results.push({ submissionId, ok: true });
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      results.push({ submissionId, ok: false, code: error.code, message: error.message });
    }
  }
  return { results };
}
