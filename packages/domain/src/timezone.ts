/**
 * Conversions between a family's local wall-clock time and absolute instants.
 *
 * Uses only Intl.DateTimeFormat (available in Node and React Native/Hermes), so
 * there is no timezone database dependency. IANA zone names ("America/Chicago")
 * are required; fixed offsets would break across DST changes.
 *
 * DST rules for local times that don't map to exactly one instant:
 *   - Gap (spring forward, e.g. 02:30 doesn't exist): shift forward by the gap
 *     length, so 02:30 becomes 03:30. A chore is never silently dropped.
 *   - Overlap (fall back, e.g. 01:30 happens twice): use the EARLIER instant.
 */
import { type PlainDate, plainDateFromParts, toParts } from "./calendar.js";

/** "HH:MM" in 24-hour time, e.g. "07:30". */
export type PlainTime = string;

const PLAIN_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

export function isPlainTime(value: unknown): value is PlainTime {
  return typeof value === "string" && PLAIN_TIME_RE.test(value);
}

export function parsePlainTime(value: string): { hour: number; minute: number } {
  const m = PLAIN_TIME_RE.exec(value);
  if (!m) throw new RangeError(`Invalid time "${value}" (expected HH:MM, 00:00–23:59)`);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    // Throws RangeError for unknown zones; isValidTimeZone relies on that.
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClockAt(epochMs: number, timeZone: string): WallClock {
  const parts = formatterFor(timeZone).formatToParts(new Date(epochMs));
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Intl did not return "${type}" for ${timeZone}`);
    return Number(part.value);
  };
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** The zone's UTC offset at a given instant, in ms (e.g. -18_000_000 for UTC-5). */
function offsetMsAt(epochMs: number, timeZone: string): number {
  const w = wallClockAt(epochMs, timeZone);
  const wallAsUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  const wholeSeconds = epochMs - (((epochMs % 1000) + 1000) % 1000);
  return wallAsUtc - wholeSeconds;
}

/**
 * The instant at which the wall clock in `timeZone` reads `date` + `time`.
 * See the module comment for how DST gaps and overlaps are resolved.
 */
export function zonedDateTimeToInstant(date: PlainDate, time: PlainTime, timeZone: string): Date {
  const { year, month, day } = toParts(date);
  const { hour, minute } = parsePlainTime(time);
  const wallMs = Date.UTC(year, month - 1, day, hour, minute);

  // The zone's offset a day before and a day after bracket any single DST
  // transition. Each offset proposes an instant; it is valid if the zone
  // really uses that offset at that instant.
  const offsetBefore = offsetMsAt(wallMs - MS_PER_DAY, timeZone);
  const offsetAfter = offsetMsAt(wallMs + MS_PER_DAY, timeZone);
  const valid = [offsetBefore, offsetAfter]
    .map((offset) => wallMs - offset)
    .filter((instant) => wallMs - offsetMsAt(instant, timeZone) === instant);

  if (valid.length > 0) {
    // One candidate normally; two in a fall-back overlap, where the earlier wins.
    return new Date(Math.min(...valid));
  }
  // Spring-forward gap: interpreting the time with the pre-transition offset
  // lands after the jump, i.e. shifted forward by the gap length.
  return new Date(wallMs - offsetBefore);
}

/** The local calendar date in `timeZone` at the given instant ("what day is it there?"). */
export function instantToPlainDate(instant: Date, timeZone: string): PlainDate {
  const w = wallClockAt(instant.getTime(), timeZone);
  return plainDateFromParts(w.year, w.month, w.day);
}

/** The local wall-clock time in `timeZone` at the given instant, as "HH:MM". */
export function instantToPlainTime(instant: Date, timeZone: string): PlainTime {
  const w = wallClockAt(instant.getTime(), timeZone);
  // Some Intl versions report midnight as hour 24.
  const hour = w.hour === 24 ? 0 : w.hour;
  return `${String(hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")}`;
}

/** Adds whole minutes to an instant (absolute time, not wall-clock time). */
export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * MS_PER_MINUTE);
}
