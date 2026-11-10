/**
 * Shared vocabulary for chore instances: statuses, priorities, roles.
 *
 * "Late" is intentionally NOT a status. It is a separate `isLate` flag on the
 * instance (see docs/mvp-plan.md), so lateness can combine with NEW,
 * IN_PROGRESS, DEFERRED, or NOT_APPROVED without duplicating states.
 */
export const CHORE_STATUSES = [
  "NEW",
  "IN_PROGRESS",
  "DEFERRED",
  "COMPLETED",
  "VERIFIED",
  "NOT_APPROVED",
  "CANCELED",
] as const;
export type ChoreStatus = (typeof CHORE_STATUSES)[number];

/** Statuses after which an instance never changes again. */
export const TERMINAL_STATUSES: ReadonlySet<ChoreStatus> = new Set(["VERIFIED", "CANCELED"]);

export function isTerminalStatus(status: ChoreStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * Statuses that can become late: the work is still outstanding. COMPLETED is
 * excluded because the assignee finished on time and is waiting on a parent.
 */
export const LATE_ELIGIBLE_STATUSES: ReadonlySet<ChoreStatus> = new Set([
  "NEW",
  "IN_PROGRESS",
  "DEFERRED",
  "NOT_APPROVED",
]);

export const PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Numeric rank for sorting; higher means more urgent. */
export function priorityRank(priority: Priority): number {
  return PRIORITIES.indexOf(priority);
}

export const ROLES = ["PARENT", "CHILD"] as const;
export type Role = (typeof ROLES)[number];
