/**
 * Calendar-date arithmetic on timezone-free dates ("PlainDate", e.g. "2026-03-15").
 *
 * Recurrence and scheduling work in a family's *local calendar*: "every 15th"
 * or "every Monday" are calendar facts, independent of time zones and DST.
 * Converting a local date+time to an absolute instant is handled separately
 * in timezone.ts.
 *
 * Internally a date is converted to an "epoch day" (days since 1970-01-01).
 * Date.UTC is used for that conversion because UTC has no DST, so the
 * arithmetic is exact. Years are limited to 1000–9999 to stay well clear of
 * Date.UTC's legacy two-digit-year behavior.
 */

declare const plainDateBrand: unique symbol;

/** A validated "YYYY-MM-DD" calendar date. Create with `parsePlainDate` or `plainDateFromParts`. */
export type PlainDate = string & { readonly [plainDateBrand]: true };

/** 0 = Sunday … 6 = Saturday (same convention as JavaScript's Date#getUTCDay). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface DateParts {
  year: number;
  /** 1–12 */
  month: number;
  /** 1–31 */
  day: number;
}

const MS_PER_DAY = 86_400_000;
const PLAIN_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_YEAR = 1000;
const MAX_YEAR = 9999;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isValidParts(year: number, month: number, day: number): boolean {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    year >= MIN_YEAR &&
    year <= MAX_YEAR &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

function format(year: number, month: number, day: number): PlainDate {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}` as PlainDate;
}

/** Builds a PlainDate from parts. Throws RangeError for impossible dates (e.g. Feb 30). */
export function plainDateFromParts(year: number, month: number, day: number): PlainDate {
  if (!isValidParts(year, month, day)) {
    throw new RangeError(`Invalid calendar date: ${year}-${month}-${day}`);
  }
  return format(year, month, day);
}

/** Type guard: true if `value` is a well-formed, real calendar date string. */
export function isPlainDate(value: unknown): value is PlainDate {
  if (typeof value !== "string") return false;
  const m = PLAIN_DATE_RE.exec(value);
  if (!m) return false;
  return isValidParts(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** Parses "YYYY-MM-DD". Throws RangeError for malformed or impossible dates. */
export function parsePlainDate(value: string): PlainDate {
  if (!isPlainDate(value)) {
    throw new RangeError(`Invalid PlainDate "${value}" (expected a real date as YYYY-MM-DD)`);
  }
  return value;
}

export function toParts(date: PlainDate): DateParts {
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

/** Days since 1970-01-01 (negative before). */
export function toEpochDay(date: PlainDate): number {
  const { year, month, day } = toParts(date);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

export function fromEpochDay(epochDay: number): PlainDate {
  const d = new Date(epochDay * MS_PER_DAY);
  return plainDateFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(date: PlainDate, days: number): PlainDate {
  if (!Number.isInteger(days)) throw new RangeError(`addDays expects an integer, got ${days}`);
  return fromEpochDay(toEpochDay(date) + days);
}

/** Signed number of days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: PlainDate, to: PlainDate): number {
  return toEpochDay(to) - toEpochDay(from);
}

/** Negative, zero, or positive, like a sort comparator. ISO strings compare lexicographically. */
export function compareDates(a: PlainDate, b: PlainDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function maxDate(a: PlainDate, b: PlainDate): PlainDate {
  return a >= b ? a : b;
}

export function minDate(a: PlainDate, b: PlainDate): PlainDate {
  return a <= b ? a : b;
}

export function weekdayOf(date: PlainDate): Weekday {
  // 1970-01-01 was a Thursday (4). The double modulo handles negative epoch days.
  return ((((toEpochDay(date) + 4) % 7) + 7) % 7) as Weekday;
}

/** The Monday on or before `date`. Weeks start on Monday for "every N weeks" anchoring. */
export function startOfWeekMonday(date: PlainDate): PlainDate {
  const daysSinceMonday = (weekdayOf(date) + 6) % 7;
  return addDays(date, -daysSinceMonday);
}

/** Months since year 0, used for "every N months" arithmetic: index = year * 12 + (month - 1). */
export function monthIndexOf(date: PlainDate): number {
  const { year, month } = toParts(date);
  return year * 12 + (month - 1);
}

/**
 * The date in the month at `monthIndex` with the given day, clamped to the
 * month's length (31 → 30/29/28). `day = -1` means "last day of the month".
 */
export function dateInMonthClamped(monthIndex: number, day: number): PlainDate {
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  const last = daysInMonth(year, month);
  return plainDateFromParts(year, month, day === -1 ? last : Math.min(day, last));
}
