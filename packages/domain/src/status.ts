/**
 * Chore instance statuses. "Late" is intentionally NOT a status: it is a
 * separate `isLate` flag on the instance (see the MVP plan), so lateness can
 * combine with NEW / IN_PROGRESS / NOT_APPROVED without duplicating states.
 *
 * Transition rules are added in Step 1; this file only fixes the vocabulary
 * so the API, contracts, and app can all import one definition.
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
