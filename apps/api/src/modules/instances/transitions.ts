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
 * Callers pass a transaction so their own writes (a Submission, a Review)
 * commit or roll back together with the status change.
 */
import {
  type ChoreAction,
  type ChoreStatus,
  type TransitionErrorCode,
  type TransitionResult,
  applyAction,
} from "@titan/domain";
import { AppError, notFound } from "../../errors.js";
import type { Membership, Prisma } from "../../generated/prisma/client.js";
import { onApproved } from "../rewards/hooks.js";

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
      chore: { select: { requiresPhoto: true, reviewPolicy: true } },
      assignees: { select: { membershipId: true } },
    },
  });
  if (!instance) throw notFound("INSTANCE_NOT_FOUND", "Chore not found.");

  const result = applyAction(input.action, {
    status: instance.status,
    actorRole: input.actor.role,
    actorIsAssignee: instance.assignees.some((a) => a.membershipId === input.actor.id),
    requiresPhoto: instance.chore.requiresPhoto,
    hasPhoto: input.hasPhoto ?? false,
    reviewPolicy: instance.chore.reviewPolicy,
  });
  if (!result.ok) {
    throw new AppError(ERROR_STATUS[result.code], result.code, result.message);
  }

  const updated = await tx.choreInstance.updateMany({
    where: { id: instance.id, status: instance.status },
    data: { status: result.status, ...(result.priority && { priority: result.priority }) },
  });
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

  if (result.releaseRewards) {
    await onApproved(tx, {
      id: instance.id,
      familyId: instance.familyId,
      rewardAmount: instance.rewardAmount,
      effortMinutes: instance.effortMinutes,
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
