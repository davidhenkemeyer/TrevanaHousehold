/**
 * Notification hooks: where events in the app become inbox notifications
 * (via `notify`, in the caller's transaction). Pushes are sent later by the
 * background jobs.
 */
import type { ChoreAction, ChoreStatus } from "@titan/domain";
import type { Prisma } from "../../generated/prisma/client.js";
import { displayNameOf, notify, parentsOf } from "./service.js";

type Tx = Prisma.TransactionClient;

export interface LateInstance {
  id: string;
  familyId: string;
  choreName: string;
  assigneeIds: string[];
}

/** Called once per instance, right after it is marked late. */
export async function onMarkedLate(tx: Tx, now: Date, instance: LateInstance): Promise<void> {
  await notify(tx, now, {
    familyId: instance.familyId,
    to: instance.assigneeIds,
    type: "CHORE_LATE",
    details: { choreName: instance.choreName },
    data: { instanceId: instance.id },
  });
}

export interface TransitionEvent {
  instanceId: string;
  familyId: string;
  choreName: string;
  action: ChoreAction;
  toStatus: ChoreStatus;
  actorId: string;
  /** After the change (claim/release adjust them first). */
  assigneeIds: readonly string[];
  /** A parent's note on rework or rejection. */
  note?: string | null | undefined;
}

/** Called by transition() after every status change. */
export async function onTransition(tx: Tx, now: Date, e: TransitionEvent): Promise<void> {
  const base = {
    familyId: e.familyId,
    exclude: e.actorId,
    data: { instanceId: e.instanceId },
  };
  const actorName = await displayNameOf(tx, e.actorId);
  const details = { choreName: e.choreName, actorName, note: e.note ?? null };

  if (e.toStatus === "PENDING_REVIEW") {
    await notify(tx, now, {
      ...base,
      to: await parentsOf(tx, e.familyId),
      type: "SUBMITTED",
      details,
    });
  } else if (e.toStatus === "APPROVED") {
    await notify(tx, now, { ...base, to: e.assigneeIds, type: "APPROVED", details });
  } else if (e.action === "requestRework") {
    await notify(tx, now, { ...base, to: e.assigneeIds, type: "NEEDS_REWORK", details });
  } else if (e.action === "reject") {
    await notify(tx, now, { ...base, to: e.assigneeIds, type: "REJECTED", details });
  } else if (e.action === "cancel") {
    await notify(tx, now, { ...base, to: e.assigneeIds, type: "CANCELED", details });
  }
}
