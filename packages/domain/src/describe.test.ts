import { describe, expect, it } from "vitest";
import { describeRecurrence, formatTime12h, ordinal } from "./describe.js";
import type { RecurrenceRule } from "./recurrence.js";

describe("describeRecurrence", () => {
  it.each([
    [{ freq: "ONCE", startDate: "2026-11-14" }, "Once on Nov 14, 2026"],
    [{ freq: "DAILY", startDate: "2026-11-09" }, "Every day"],
    [{ freq: "DAILY", interval: 3, startDate: "2026-11-09" }, "Every 3 days"],
    // 2026-11-09 is a Monday: the default weekday.
    [{ freq: "WEEKLY", startDate: "2026-11-09" }, "Every week on Mon"],
    [
      { freq: "WEEKLY", interval: 2, startDate: "2026-11-09", byWeekday: [4, 1] },
      "Every 2 weeks on Mon, Thu",
    ],
    [{ freq: "WEEKLY", startDate: "2026-11-09", byWeekday: [0, 6] }, "Every weekend"],
    [{ freq: "WEEKLY", startDate: "2026-11-09", byWeekday: [1, 2, 3, 4, 5] }, "Every weekday"],
    [{ freq: "WEEKLY", startDate: "2026-11-09", byWeekday: [0, 1, 2, 3, 4, 5, 6] }, "Every day"],
    [
      { freq: "WEEKLY", interval: 2, startDate: "2026-11-09", byWeekday: [0, 6] },
      "Every 2 weeks on weekends",
    ],
    [{ freq: "MONTHLY", startDate: "2026-11-15" }, "Every month on the 15th"],
    [{ freq: "MONTHLY", startDate: "2026-11-15", byMonthDay: -1 }, "Every month on the last day"],
    [
      { freq: "MONTHLY", interval: 2, startDate: "2026-01-31" },
      "Every 2 months on the 31st (or the last day in shorter months)",
    ],
    [
      { freq: "QUARTERLY", startDate: "2026-11-01" },
      "Every quarter on the 1st (Nov, Feb, May, Aug)",
    ],
    [{ freq: "QUARTERLY", interval: 2, startDate: "2026-01-02" }, "Every 2 quarters on the 2nd"],
    [{ freq: "ANNUAL", startDate: "2026-03-05" }, "Every year on Mar 5"],
    [{ freq: "ANNUAL", startDate: "2028-02-29" }, "Every year on Feb 29 (Feb 28 in other years)"],
    [
      { freq: "ANNUAL", startDate: "2026-02-01", byMonthDay: -1 },
      "Every year on the last day of Feb",
    ],
    [{ freq: "ANNUAL", interval: 2, startDate: "2026-03-05" }, "Every 2 years on Mar 5"],
    [
      { freq: "DAILY", startDate: "2026-11-09", timeOfDay: "16:30", endDate: "2026-12-31" },
      "Every day from 4:30 PM, until Dec 31, 2026",
    ],
  ] as const)("%j → %s", (rule, expected) => {
    expect(describeRecurrence(rule as unknown as RecurrenceRule)).toBe(expected);
  });

  it("returns a placeholder for an invalid rule instead of throwing", () => {
    expect(describeRecurrence({ freq: "DAILY", startDate: "2026-02-30" })).toBe("Invalid schedule");
    expect(describeRecurrence({ freq: "WEEKLY", startDate: "2026-11-09", byWeekday: [] })).toBe(
      "Invalid schedule",
    );
  });
});

describe("helpers", () => {
  it("ordinal", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "31st",
    ]);
  });
  it("formatTime12h", () => {
    expect(["00:00", "09:05", "12:00", "16:30", "23:59"].map(formatTime12h)).toEqual([
      "12:00 AM",
      "9:05 AM",
      "12:00 PM",
      "4:30 PM",
      "11:59 PM",
    ]);
  });
});
