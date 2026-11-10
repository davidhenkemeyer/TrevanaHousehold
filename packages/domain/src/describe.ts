/**
 * Plain-English descriptions of recurrence rules ("Every 2 weeks on Mon, Thu").
 *
 * Shared by the chore editor (live preview), chore lists, and later voice
 * assistants, so every client says the same thing. English only for now;
 * the output is a display string, never parsed back.
 */
import { type PlainDate, isPlainDate, toParts, weekdayOf } from "./calendar.js";
import { DEFAULT_TIME_OF_DAY, type RecurrenceRule, validateRecurrenceRule } from "./recurrence.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Indexed by Weekday (0 = Sunday). */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Display order: the week starts on Monday, like the WEEKLY interval math. */
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];

/** "1st", "2nd", "3rd", "4th", "11th", "21st", ... */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** "Nov 14, 2026" */
export function formatShortDate(date: PlainDate): string {
  const { year, month, day } = toParts(date);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

/** "16:30" → "4:30 PM", "00:00" → "12:00 AM". */
export function formatTime12h(time: string): string {
  const [h = 0, m = 0] = time.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

function describeWeekdays(days: readonly number[]): string {
  const set = new Set(days);
  if (set.size === 7) return "every day of the week";
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return "weekdays";
  if (set.size === 2 && set.has(0) && set.has(6)) return "weekends";
  return MONDAY_FIRST.filter((d) => set.has(d))
    .map((d) => WEEKDAYS[d])
    .join(", ");
}

/** "the 15th", "the last day", "the 31st (or the last day in shorter months)". */
function describeMonthDay(day: number): string {
  if (day === -1) return "the last day";
  if (day >= 29) return `the ${ordinal(day)} (or the last day in shorter months)`;
  return `the ${ordinal(day)}`;
}

/**
 * Describes a rule, e.g. "Every week on Mon, Thu from 4:00 PM, until Dec 31, 2026".
 * An invalid rule yields "Invalid schedule" rather than throwing, so a
 * half-filled editor form can still render its preview.
 */
export function describeRecurrence(rule: RecurrenceRule): string {
  if (validateRecurrenceRule(rule).length > 0 || !isPlainDate(rule.startDate)) {
    return "Invalid schedule";
  }
  const start = rule.startDate;
  const { month: startMonth, day: startDay } = toParts(start);
  const n = rule.interval ?? 1;
  let text: string;

  switch (rule.freq) {
    case "ONCE":
      text = `Once on ${formatShortDate(start)}`;
      break;
    case "DAILY":
      text = n === 1 ? "Every day" : `Every ${n} days`;
      break;
    case "WEEKLY": {
      const days = rule.byWeekday ?? [weekdayOf(start)];
      const which = describeWeekdays(days);
      if (n === 1 && which === "every day of the week") text = "Every day";
      else if (n === 1 && (which === "weekdays" || which === "weekends"))
        text = `Every ${which.slice(0, -1)}`;
      else text = `${n === 1 ? "Every week" : `Every ${n} weeks`} on ${which}`;
      break;
    }
    case "MONTHLY": {
      const day = rule.byMonthDay ?? startDay;
      text = `${n === 1 ? "Every month" : `Every ${n} months`} on ${describeMonthDay(day)}`;
      break;
    }
    case "QUARTERLY": {
      const day = rule.byMonthDay ?? startDay;
      // Which months it lands in, counted from the start month: "(Jan, Apr, Jul, Oct)".
      const months =
        n === 1
          ? ` (${[0, 3, 6, 9].map((k) => MONTHS[(startMonth - 1 + k) % 12]).join(", ")})`
          : "";
      text = `${n === 1 ? "Every quarter" : `Every ${n} quarters`} on ${describeMonthDay(day)}${months}`;
      break;
    }
    case "ANNUAL": {
      const day = rule.byMonthDay ?? startDay;
      const monthName = MONTHS[startMonth - 1] ?? "";
      let when: string;
      if (day === -1) when = `the last day of ${monthName}`;
      else if (startMonth === 2 && day === 29) when = "Feb 29 (Feb 28 in other years)";
      else when = `${monthName} ${day}`;
      text = `${n === 1 ? "Every year" : `Every ${n} years`} on ${when}`;
      break;
    }
  }

  if (rule.timeOfDay !== undefined && rule.timeOfDay !== DEFAULT_TIME_OF_DAY) {
    text += ` from ${formatTime12h(rule.timeOfDay)}`;
  }
  if (rule.endDate !== undefined && isPlainDate(rule.endDate)) {
    text += `, until ${formatShortDate(rule.endDate)}`;
  }
  return text;
}
