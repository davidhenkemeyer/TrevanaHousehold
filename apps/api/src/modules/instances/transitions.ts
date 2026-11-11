/**
 * The one place that changes a chore instance's status. Everything (kid
 * actions, submissions, reviews, batch approval) goes through `transition()`:
 *
 *   1. load the instance and build the domain TransitionContext,
 *   2. ask the domain state machine (applyAction) what happens,
 *   3. update the row only if its status is still what we read (if another
 *      request changed it first, fail with 409 STALE_STATE instead of
 *      overwriting their change),
 *   4. record an InstanceEvent,
 *   5. release rewards when the instance became APPROVED.
 *
 * Job board: "claim" and "release" also go through here. They change who the
 * assignee is and the instance's `board` state, guarded the same way, so
 * when two people claim at once exactly one wins (the other gets 409
 * ALREADY_CLAIMED). Unclaimed jobs past their deadline are expired by
 * `expireOpenInstance` (called from the background job).
 *
 * Callers pass a transaction so their own writes (a Submission, a Review)
 * commit or roll back together with the status change.
 */
import {
  type ChoreAction,
  type ChoreStatus,
  type TransitionErrorCode,
  type TransitionResult,
  applyAction,
  shouldExpireOpen,
  xpFor,
} from "@titan/domain";
import { AppError, notFound } from "../../errors.js";
import type { Membership, Prisma } from "../../generated/prisma/client.js";
import { onApproved } from "../rewards/hooks.js";
import { inPool } from "./views.js";

type Tx = Prisma.TransactionClient;

const ERROR_STATUS: Record<TransitionErrorCode, number> = {
  TERMINAL: 409,
  INVALID_TRANSITION: 409,
  FORBIDDEN: 403,
  PHOTO_REQUIRED: 400,
};

export interface TransitionInput {
  familyId: string;
  instanceId: string;
  action: ChoreAction;
  actor: Membership;
  hasPhoto?: boolean;
  now: Date;
}

export interface TransitionOutcome {
  fromStatus: ChoreStatus;
  result: Extract<TransitionResult, { ok: true }>;
  instance: { id: string; choreId: string; reviewPolicy: string };
}

export async function transition(tx: Tx, input: TransitionInput): Promise<TransitionOutcome> {
  const instance = await tx.choreInstance.findFirst({
    where: { id: input.instanceId, familyId: input.familyId },
    include: {
      chore: {
        select: {
          requiresPhoto: true,
          reviewPolicy: true,
          xpOverride: true,
          eligible: { select: { membershipId: true } },
        },
      },
      assignees: { select: { membershipId: true } },
    },
  });
  if (!instance) throw notFound("INSTANCE_NOT_FOUND", "Chore not found.");

  // Losing a claim race reads the same whether the other claim landed just
  // before this request loaded the job or just before it tried to update it.
  if (input.action === "claim" && instance.board === "CLAIMED") {
    throw new AppError(409, "ALREADY_CLAIMED", "Someone else just took this job.");
  }

  const result = applyAction(input.action, {
    status: instance.status,
    actorRole: input.actor.role,
    actorIsAssignee: instance.assignees.some((a) => a.membershipId === input.actor.id),
    requiresPhoto: instance.chore.requiresPhoto,
    hasPhoto: input.hasPhoto ?? false,
    reviewPolicy: instance.chore.reviewPolicy,
    board: instance.board,
    actorInPool: inPool(instance.chore.eligible, input.actor.id),
  });
  if (!result.ok) {
    throw new AppError(ERROR_STATUS[result.code], result.code, result.message);
  }

  const updated = await tx.choreInstance.updateMany({
    where: { id: instance.id, status: instance.status, board: instance.board },
    data: {
      status: result.status,
      ...(result.priority && { priority: result.priority }),
      ...(result.board && { board: result.board }),
      // A job going back on the board is nobody's, so it can't be anybody's late chore.
      ...(result.board === "OPEN" && { isLate: false }),
    },
  });
  if (updated.count === 0 && input.action === "claim") {
    throw new AppError(409, "ALREADY_CLAIMED", "Someone else just took this job.");
  }
  if (updated.count === 0) {
    throw new AppError(
      409,
      "STALE_STATE",
      "This chore was just changed by someone else. Refresh and try again.",
    );
  }

  await tx.instanceEvent.create({
    data: {
      instanceId: instance.id,
      actorMembershipId: input.actor.id,
      action: input.action,
      fromStatus: instance.status,
      toStatus: result.status,
      createdAt: input.now,
    },
  });

  // Claiming makes the actor the assignee; giving a job back leaves it with nobody.
  if (result.board === "CLAIMED" || result.board === "OPEN") {
    await tx.instanceAssignee.deleteMany({ where: { instanceId: instance.id } });
  }
  if (result.board === "CLAIMED") {
    await tx.instanceAssignee.create({
      data: { instanceId: instance.id, membershipId: input.actor.id },
    });
  }

  if (result.releaseRewards) {
    await onApproved(tx, input.now, {
      id: instance.id,
      familyId: instance.familyId,
      rewardAmount: instance.rewardAmount,
      effortMinutes: instance.effortMinutes,
      xp: xpFor(instance.effortMinutes, instance.chore.xpOverride),
      assigneeIds: instance.assignees.map((a) => a.membershipId),
    });
  }

  return {
    fromStatus: instance.status,
    result,
    instance: {
      id: instance.id,
      choreId: instance.choreId,
      reviewPolicy: instance.chore.reviewPolicy,
    },
  };
}

/**
 * Takes an unclaimed job off the board once its deadline has passed. Nobody
 * is marked late for it. Returns false if it was claimed (or already handled)
 * in the meantime.
 */
export async function expireOpenInstance(tx: Tx, instanceId: string, now: Date): Promise<boolean> {
  const instance = await tx.choreInstance.findUnique({
    where: { id: instanceId },
    select: { id: true, status: true, board: true, dueAt: true },
  });
  if (!instance || !shouldExpireOpen(instance, now)) return false;
  const updated = await tx.choreInstance.updateMany({
    where: { id: instance.id, status: "NEW", board: "OPEN" },
    data: { status: "CANCELED" },
  });
  if (updated.count === 0) return false;
  await tx.instanceEvent.create({
    data: {
      instanceId: instance.id,
      actorMembershipId: null,
      action: "expire",
      fromStatus: "NEW",
      toStatus: "CANCELED",
      createdAt: now,
    },
  });
  return true;
}
