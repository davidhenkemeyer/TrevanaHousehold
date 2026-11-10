/**
 * Glue between chore definitions and the assignment planner: which dated
 * occurrences need planning, and how effort is charged to assignees.
 */
import type { AssignMode, PlanOccurrence } from "./assignment.js";
import { type PlainDate, addDays } from "./calendar.js";
import { type RecurrenceRule, occurrencesBetween } from "./recurrence.js";
import type { Priority } from "./status.js";

/** How many days ahead (including today) occurrences are created and assigned. */
export const PLANNING_WINDOW_DAYS = 7;

/** The planning window starting on `today`: [today, today + 6] inclusive. */
export function planningWindow(today: PlainDate): { from: PlainDate; to: PlainDate } {
  return { from: today, to: addDays(today, PLANNING_WINDOW_DAYS - 1) };
}

/** Stable key for one chore on one date. Also the planner's occurrence key. */
export function occurrenceKey(choreId: string, date: PlainDate): string {
  return `${choreId}:${date}`;
}

/**
 * Minutes charged to each assignee of a shared chore: the effort split evenly,
 * rounded up, so a 15-minute chore for two kids costs each of them 8.
 */
export function minutesPerAssignee(effortMinutes: number, assigneeCount: number): number {
  if (assigneeCount <= 0) return 0;
  return Math.ceil(effortMinutes / assigneeCount);
}

export interface ScheduleChore {
  id: string;
  recurrence: RecurrenceRule;
  effortMinutes: number;
  priority: Priority;
  mode: AssignMode;
  /** FIXED: owners. ROTATE/AUTO: candidates in rotation order (empty = everyone). */
  pool: readonly string[];
}

/**
 * Every occurrence of `chores` within [from, to] that doesn't exist yet,
 * shaped for `planAssignments`. `existingKeys` holds occurrenceKey(...) values
 * of instances already in the database, which are never planned twice.
 */
export function expandOccurrences(
  chores: readonly ScheduleChore[],
  from: PlainDate,
  to: PlainDate,
  existingKeys: ReadonlySet<string>,
): PlanOccurrence[] {
  return chores.flatMap((chore) =>
    occurrencesBetween(chore.recurrence, from, to)
      .filter((date) => !existingKeys.has(occurrenceKey(chore.id, date)))
      .map((date) => ({
        key: occurrenceKey(chore.id, date),
        choreId: chore.id,
        date,
        effortMinutes: chore.effortMinutes,
        priority: chore.priority,
        mode: chore.mode,
        pool: chore.pool,
      })),
  );
}
