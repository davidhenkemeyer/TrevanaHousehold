/**
 * Recurrence rules: which local calendar dates a chore occurs on.
 *
 * Rules are stored as JSON on the Chore row, so fields are plain strings and
 * numbers; `validateRecurrenceRule` is the gatekeeper, and `occurrencesBetween`
 * refuses invalid rules.
 *
 * Semantics:
 *   - ONCE:      a one-time chore, on `startDate` only. (No interval, weekday,
 *                month-day, or end date.)
 *   - DAILY:     every `interval` days, counted from `startDate`.
 *   - WEEKLY:    on `byWeekday` days (default: startDate's weekday) of every
 *                `interval`-th week. Weeks run Monday–Sunday and are counted
 *                from the week containing `startDate`.
 *   - MONTHLY / QUARTERLY / ANNUAL: every `interval` × 1 / 3 / 12 months,
 *                counted from startDate's month, on `byMonthDay` (default:
 *                startDate's day; -1 = last day of the month).
 *                Days past a month's end are CLAMPED: "the 31st" falls on
 *                Feb 28/29, Apr 30, etc., and Feb 29 annual chores fall on
 *                Feb 28 in non-leap years. (For chores, "a day late" beats
 *                "skipped entirely".)
 *   - No occurrence is ever before `startDate` or after `endDate` (inclusive).
 */
import {
  type PlainDate,
  type Weekday,
  addDays,
  compareDates,
  dateInMonthClamped,
  daysBetween,
  isPlainDate,
  maxDate,
  minDate,
  monthIndexOf,
  startOfWeekMonday,
  toParts,
  weekdayOf,
} from "./calendar.js";
import { isPlainTime } from "./timezone.js";

export const FREQUENCIES = ["ONCE", "DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export interface RecurrenceRule {
  freq: Frequency;
  /** Repeat every N periods. Default 1. */
  interval?: number;
  /** First possible occurrence date, "YYYY-MM-DD". */
  startDate: string;
  /** Last possible occurrence date (inclusive). Omit for "forever". */
  endDate?: string;
  /** WEEKLY only: weekdays 0 (Sun) – 6 (Sat). Default: startDate's weekday. */
  byWeekday?: number[];
  /** MONTHLY / QUARTERLY / ANNUAL only: 1–31, or -1 for the last day. Default: startDate's day. */
  byMonthDay?: number;
  /** Local time the chore becomes available, "HH:MM". Default "00:00". */
  timeOfDay?: string;
}

/** Largest supported query window. Generous for previews; guards against runaway loops. */
export const MAX_RANGE_DAYS = 3660;
export const MAX_INTERVAL = 365;
export const DEFAULT_TIME_OF_DAY = "00:00";

const MONTHS_PER_PERIOD: Record<Exclude<Frequency, "ONCE" | "DAILY" | "WEEKLY">, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  ANNUAL: 12,
};

function isMonthBased(freq: Frequency): freq is "MONTHLY" | "QUARTERLY" | "ANNUAL" {
  return freq === "MONTHLY" || freq === "QUARTERLY" || freq === "ANNUAL";
}

/** Returns a list of human-readable problems; an empty list means the rule is valid. */
export function validateRecurrenceRule(rule: RecurrenceRule): string[] {
  const errors: string[] = [];

  if (!FREQUENCIES.includes(rule.freq)) {
    errors.push(`freq must be one of ${FREQUENCIES.join(", ")}`);
  }
  if (rule.freq === "ONCE") {
    if (rule.interval !== undefined && rule.interval !== 1) {
      errors.push("interval is not allowed for ONCE rules");
    }
    if (rule.endDate !== undefined) errors.push("endDate is not allowed for ONCE rules");
  }
  if (
    rule.interval !== undefined &&
    (!Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > MAX_INTERVAL)
  ) {
    errors.push(`interval must be an integer from 1 to ${MAX_INTERVAL}`);
  }
  if (!isPlainDate(rule.startDate)) {
    errors.push("startDate must be a real date in YYYY-MM-DD format");
  }
  if (rule.endDate !== undefined) {
    if (!isPlainDate(rule.endDate)) {
      errors.push("endDate must be a real date in YYYY-MM-DD format");
    } else if (isPlainDate(rule.startDate) && rule.endDate < rule.startDate) {
      errors.push("endDate must not be before startDate");
    }
  }
  if (rule.byWeekday !== undefined) {
    if (rule.freq !== "WEEKLY") {
      errors.push("byWeekday is only allowed for WEEKLY rules");
    } else if (rule.byWeekday.length === 0) {
      errors.push("byWeekday must list at least one weekday");
    } else if (!rule.byWeekday.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
      errors.push("byWeekday values must be integers 0 (Sun) to 6 (Sat)");
    } else if (new Set(rule.byWeekday).size !== rule.byWeekday.length) {
      errors.push("byWeekday must not contain duplicates");
    }
  }
  if (rule.byMonthDay !== undefined) {
    if (!isMonthBased(rule.freq)) {
      errors.push("byMonthDay is only allowed for MONTHLY, QUARTERLY, and ANNUAL rules");
    } else if (
      !Number.isInteger(rule.byMonthDay) ||
      !(rule.byMonthDay === -1 || (rule.byMonthDay >= 1 && rule.byMonthDay <= 31))
    ) {
      errors.push("byMonthDay must be 1–31, or -1 for the last day of the month");
    }
  }
  if (rule.timeOfDay !== undefined && !isPlainTime(rule.timeOfDay)) {
    errors.push("timeOfDay must be HH:MM (00:00–23:59)");
  }
  return errors;
}

export function assertValidRecurrenceRule(rule: RecurrenceRule): void {
  const errors = validateRecurrenceRule(rule);
  if (errors.length > 0) {
    throw new RangeError(`Invalid recurrence rule: ${errors.join("; ")}`);
  }
}

/**
 * All occurrence dates of `rule` within [from, to] (both inclusive), ascending.
 * Throws RangeError for an invalid rule, from > to, or a window larger than MAX_RANGE_DAYS.
 */
export function occurrencesBetween(
  rule: RecurrenceRule,
  from: PlainDate,
  to: PlainDate,
): PlainDate[] {
  assertValidRecurrenceRule(rule);
  if (compareDates(from, to) > 0) {
    throw new RangeError(`from (${from}) must not be after to (${to})`);
  }
  if (daysBetween(from, to) > MAX_RANGE_DAYS) {
    throw new RangeError(`Query window exceeds ${MAX_RANGE_DAYS} days`);
  }

  // Validated above, so these casts are safe.
  const start = rule.startDate as PlainDate;
  const end = rule.endDate as PlainDate | undefined;
  const lo = maxDate(from, start);
  const hi = end ? minDate(to, end) : to;
  if (compareDates(lo, hi) > 0) return [];

  const interval = rule.interval ?? 1;
  switch (rule.freq) {
    case "ONCE":
      // lo = max(from, start), so the start date is in the window exactly when lo === start.
      return lo === start ? [start] : [];
    case "DAILY":
      return dailyOccurrences(start, interval, lo, hi);
    case "WEEKLY":
      return weeklyOccurrences(start, interval, rule.byWeekday, lo, hi);
    case "MONTHLY":
    case "QUARTERLY":
    case "ANNUAL":
      return monthlyOccurrences(
        start,
        interval * MONTHS_PER_PERIOD[rule.freq],
        rule.byMonthDay ?? toParts(start).day,
        lo,
        hi,
      );
  }
}

/** True if `date` is an occurrence of `rule`. */
export function occursOn(rule: RecurrenceRule, date: PlainDate): boolean {
  return occurrencesBetween(rule, date, date).length === 1;
}

function dailyOccurrences(
  start: PlainDate,
  interval: number,
  lo: PlainDate,
  hi: PlainDate,
): PlainDate[] {
  const result: PlainDate[] = [];
  // Jump to the first on-cycle date at or after `lo`.
  const remainder = daysBetween(start, lo) % interval;
  let d = remainder === 0 ? lo : addDays(lo, interval - remainder);
  while (d <= hi) {
    result.push(d);
    d = addDays(d, interval);
  }
  return result;
}

function weeklyOccurrences(
  start: PlainDate,
  interval: number,
  byWeekday: number[] | undefined,
  lo: PlainDate,
  hi: PlainDate,
): PlainDate[] {
  const days = new Set<number>(byWeekday ?? [weekdayOf(start)]);
  const anchor = startOfWeekMonday(start);
  const result: PlainDate[] = [];
  for (let d = lo; d <= hi; d = addDays(d, 1)) {
    const weekNumber = Math.floor(daysBetween(anchor, d) / 7);
    if (weekNumber % interval === 0 && days.has(weekdayOf(d) as Weekday)) {
      result.push(d);
    }
  }
  return result;
}

function monthlyOccurrences(
  start: PlainDate,
  stepMonths: number,
  monthDay: number,
  lo: PlainDate,
  hi: PlainDate,
): PlainDate[] {
  const startMonth = monthIndexOf(start);
  // Skip whole cycles that end before `lo`.
  const firstCycle = Math.max(0, Math.floor((monthIndexOf(lo) - startMonth) / stepMonths));
  const lastMonth = monthIndexOf(hi);
  const result: PlainDate[] = [];
  for (let k = firstCycle; startMonth + k * stepMonths <= lastMonth; k++) {
    const d = dateInMonthClamped(startMonth + k * stepMonths, monthDay);
    if (d >= lo && d <= hi) result.push(d);
  }
  return result;
}
