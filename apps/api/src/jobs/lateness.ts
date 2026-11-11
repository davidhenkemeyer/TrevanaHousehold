/**
 * Late marking: flags outstanding occurrences whose deadline has passed.
 *
 * "Late" is a flag, not a status (see packages/domain/src/status.ts), so the
 * instance keeps its status and simply gains `isLate`; its effective priority
 * becomes HIGH. Each instance is flagged once, records a system event in its
 * history, and triggers the "chore is late" notification hook.
 */
import { LATE_ELIGIBLE_STATUSES, shouldMarkLate } from "@titan/domain";
import type { FastifyBaseLogger } from "fastify";
import type { Deps } from "../deps.js";
import { expireOpenInstance } from "../modules/instances/transitions.js";
import { onMarkedLate } from "../modules/notifications/hooks.js";

/** Instances handled per query, so a backlog never becomes one huge transaction. */
const BATCH_SIZE = 200;

export async function markLateInstances(
  deps: Pick<Deps, "db" | "now">,
  log: Pick<FastifyBaseLogger, "info">,
): Promise<number> {
  const now = deps.now();
  const eligible = [...LATE_ELIGIBLE_STATUSES];
  let marked = 0;
  let afterId: string | undefined;

  for (;;) {
    const batch = await deps.db.choreInstance.findMany({
      where: {
        isLate: false,
        // Unclaimed job-board jobs are never late; they expire (below).
        board: { not: "OPEN" },
        status: { in: eligible },
        dueAt: { lt: now },
        ...(afterId !== undefined && { id: { gt: afterId } }),
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      select: {
        id: true,
        familyId: true,
        status: true,
        isLate: true,
        dueAt: true,
        assignees: { select: { membershipId: true } },
        chore: { select: { name: true } },
      },
    });
    if (batch.length === 0) break;
    afterId = batch.at(-1)?.id;

    for (const instance of batch) {
      if (!shouldMarkLate(instance, now)) continue; // the domain rule has the final word
      const flagged = await deps.db.$transaction(async (tx) => {
        // Guarded update: skip it if the kid finished (or someone else flagged it) meanwhile.
        const updated = await tx.choreInstance.updateMany({
          where: { id: instance.id, isLate: false, status: instance.status },
          data: { isLate: true },
        });
        if (updated.count === 0) return false;
        await tx.instanceEvent.create({
          data: {
            instanceId: instance.id,
            actorMembershipId: null,
            action: "markLate",
            fromStatus: instance.status,
            toStatus: instance.status,
            createdAt: now,
          },
        });
        await onMarkedLate(tx, now, {
          id: instance.id,
          familyId: instance.familyId,
          choreName: instance.chore.name,
          assigneeIds: instance.assignees.map((a) => a.membershipId),
        });
        return true;
      });
      if (flagged) marked++;
    }
    if (batch.length < BATCH_SIZE) break;
  }

  if (marked > 0) log.info({ marked }, "Marked chores late");
  return marked;
}

/**
 * Job board: unclaimed jobs past their deadline quietly leave the board
 * (a recurring job returns on its next date). Runs with late marking.
 */
export async function expireOpenJobs(
  deps: Pick<Deps, "db" | "now">,
  log: Pick<FastifyBaseLogger, "info">,
): Promise<number> {
  const now = deps.now();
  let expired = 0;
  for (;;) {
    const batch = await deps.db.choreInstance.findMany({
      where: { board: "OPEN", status: "NEW", dueAt: { lt: now } },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      select: { id: true },
    });
    if (batch.length === 0) break;
    for (const { id } of batch) {
      if (await deps.db.$transaction((tx) => expireOpenInstance(tx, id, now))) expired++;
    }
    if (batch.length < BATCH_SIZE) break;
  }
  if (expired > 0) log.info({ expired }, "Expired unclaimed jobs");
  return expired;
}
