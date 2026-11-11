/**
 * Late detection and effective priority.
 */
import type { BoardState } from "./stateMachine.js";
import type { ChoreStatus, Priority } from "./status.js";
import { LATE_ELIGIBLE_STATUSES } from "./status.js";

export interface LatenessInput {
  status: ChoreStatus;
  isLate: boolean;
  dueAt: Date;
  /** Default "NONE". Unclaimed job-board jobs are never late: they expire instead. */
  board?: BoardState;
}

/**
 * True if the late-marking job should flag this instance now: it is past due,
 * still outstanding, and not already flagged (so the "late" notification is
 * sent once, not on every job run).
 */
export function shouldMarkLate(instance: LatenessInput, now: Date): boolean {
  return (
    !instance.isLate &&
    instance.board !== "OPEN" &&
    LATE_ELIGIBLE_STATUSES.has(instance.status) &&
    now.getTime() > instance.dueAt.getTime()
  );
}

/**
 * True if an unclaimed job-board job should quietly leave the board now:
 * nobody took it before its deadline. Nobody is flagged late for it; a
 * recurring job simply comes back on its next date.
 */
export function shouldExpireOpen(
  instance: { status: ChoreStatus; board: BoardState; dueAt: Date },
  now: Date,
): boolean {
  return (
    instance.board === "OPEN" &&
    instance.status === "NEW" &&
    now.getTime() > instance.dueAt.getTime()
  );
}

/**
 * The priority to show and sort by. Late chores and chores sent back for
 * rework are always HIGH, whatever their stored priority, per the design doc.
 */
export function effectivePriority(
  storedPriority: Priority,
  status: ChoreStatus,
  isLate: boolean,
): Priority {
  if (isLate || status === "NEEDS_REWORK") return "HIGH";
  return storedPriority;
}
