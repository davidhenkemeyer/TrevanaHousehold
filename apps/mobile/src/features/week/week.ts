/**
 * Week view and capacity editor helpers. The numbers themselves come from the
 * API (`week-load`, computed by the domain's summarizeDayLoad); this only
 * shapes them for display.
 */
import {
  type PlainDate,
  WEEKDAY_KEYS,
  type WeekdayKey,
  type WeeklyCapacity,
  addDays,
  toParts,
  weekdayOf,
} from "@tenara/domain";

/** How full the bar is, 0–1. A day off with any work shows as full. */
export function loadFraction(assigned: number, capacity: number): number {
  if (capacity <= 0) return assigned > 0 ? 1 : 0;
  return Math.min(assigned / capacity, 1);
}

/** "Tue 10" */
export function dayLabel(date: PlainDate): string {
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekdayOf(date)]} ${toParts(date).day}`;
}

/** Moves the week view by whole weeks. */
export function shiftWeek(from: PlainDate, weeks: number): PlainDate {
  return addDays(from, weeks * 7);
}

/** Display order for the capacity editor (the week starts on Monday). */
export const WEEKDAYS_MONDAY_FIRST: readonly { key: WeekdayKey; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

export const CAPACITY_STEP = 5;
export const CAPACITY_MAX = 600;

/** Quick starting points: minutes on school/work days and on weekends. */
export const CAPACITY_PRESETS = [
  { label: "Young kid", weekday: 15, weekend: 30 },
  { label: "Kid", weekday: 20, weekend: 40 },
  { label: "Teen", weekday: 30, weekend: 60 },
  { label: "Parent", weekday: 60, weekend: 90 },
] as const;

export function capacityFromPreset(weekday: number, weekend: number): WeeklyCapacity {
  return Object.fromEntries(
    WEEKDAY_KEYS.map((key) => [key, key === "sat" || key === "sun" ? weekend : weekday]),
  ) as WeeklyCapacity;
}

export function stepCapacity(minutes: number, direction: 1 | -1): number {
  return Math.min(Math.max(minutes + direction * CAPACITY_STEP, 0), CAPACITY_MAX);
}

export function weeklyTotal(capacity: WeeklyCapacity): number {
  return WEEKDAY_KEYS.reduce((sum, key) => sum + capacity[key], 0);
}

/** "2 h 30 min", "45 min", "0 min". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
