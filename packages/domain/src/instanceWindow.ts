/**
 * When an occurrence becomes available and when it is due, as absolute instants.
 */
import { type PlainDate, addDays } from "./calendar.js";
import { DEFAULT_TIME_OF_DAY } from "./recurrence.js";
import { type PlainTime, addMinutes, zonedDateTimeToInstant } from "./timezone.js";

const MINUTES_PER_DAY = 1440;

export interface InstanceWindow {
  availableAt: Date;
  dueAt: Date;
}

/**
 * @param occurrenceDate  local calendar date of the occurrence
 * @param timeOfDay       local "HH:MM" the chore becomes available (default 00:00)
 * @param deadlineMinutes how long after availability it is due (must be > 0)
 * @param timeZone        the family's IANA time zone
 *
 * Whole days of the deadline are added on the *local calendar*, the remainder
 * as absolute minutes. So "available Saturday 09:00, due in 1 week" is due the
 * next Saturday at 09:00 local time even if DST changed in between, instead of
 * drifting to 08:00 or 10:00.
 */
export function computeInstanceWindow(
  occurrenceDate: PlainDate,
  timeOfDay: PlainTime | undefined,
  deadlineMinutes: number,
  timeZone: string,
): InstanceWindow {
  if (!Number.isInteger(deadlineMinutes) || deadlineMinutes <= 0) {
    throw new RangeError(`deadlineMinutes must be a positive integer, got ${deadlineMinutes}`);
  }
  const time = timeOfDay ?? DEFAULT_TIME_OF_DAY;
  const availableAt = zonedDateTimeToInstant(occurrenceDate, time, timeZone);

  const wholeDays = Math.floor(deadlineMinutes / MINUTES_PER_DAY);
  const extraMinutes = deadlineMinutes % MINUTES_PER_DAY;
  const dueDay = zonedDateTimeToInstant(addDays(occurrenceDate, wholeDays), time, timeZone);
  return { availableAt, dueAt: addMinutes(dueDay, extraMinutes) };
}
