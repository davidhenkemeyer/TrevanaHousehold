import { describe, expect, it } from "vitest";
import { parsePlainDate as d } from "./calendar.js";
import {
  type RecurrenceRule,
  occurrencesBetween,
  occursOn,
  validateRecurrenceRule,
} from "./recurrence.js";

const between = (rule: RecurrenceRule, from: string, to: string) =>
  occurrencesBetween(rule, d(from), d(to));

describe("ONCE", () => {
  const rule: RecurrenceRule = { freq: "ONCE", startDate: "2026-11-14" };

  it("occurs only on its start date", () => {
    expect(between(rule, "2026-11-01", "2026-11-30")).toEqual(["2026-11-14"]);
    expect(between(rule, "2026-11-14", "2026-11-14")).toEqual(["2026-11-14"]);
  });

  it("is absent from windows that don't contain the date", () => {
    expect(between(rule, "2026-11-15", "2026-11-30")).toEqual([]);
    expect(between(rule, "2026-11-01", "2026-11-13")).toEqual([]);
  });

  it("rejects repeat settings", () => {
    expect(validateRecurrenceRule({ ...rule, interval: 2 })).not.toEqual([]);
    expect(validateRecurrenceRule({ ...rule, endDate: "2026-12-01" })).not.toEqual([]);
    expect(validateRecurrenceRule({ ...rule, byWeekday: [1] })).not.toEqual([]);
    expect(validateRecurrenceRule({ ...rule, byMonthDay: 1 })).not.toEqual([]);
  });
});

describe("DAILY", () => {
  it("repeats every day by default", () => {
    expect(between({ freq: "DAILY", startDate: "2026-11-09" }, "2026-11-08", "2026-11-11")).toEqual(
      ["2026-11-09", "2026-11-10", "2026-11-11"],
    );
  });

  it("stays on cycle when the window starts mid-cycle", () => {
    const rule: RecurrenceRule = { freq: "DAILY", interval: 2, startDate: "2026-01-01" };
    expect(between(rule, "2026-01-04", "2026-01-10")).toEqual([
      "2026-01-05",
      "2026-01-07",
      "2026-01-09",
    ]);
  });

  it("stops at endDate (inclusive)", () => {
    const rule: RecurrenceRule = { freq: "DAILY", startDate: "2026-01-01", endDate: "2026-01-03" };
    expect(between(rule, "2026-01-01", "2026-01-10")).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ]);
  });

  it("returns nothing for a window entirely before startDate or after endDate", () => {
    expect(between({ freq: "DAILY", startDate: "2026-06-01" }, "2026-01-01", "2026-05-31")).toEqual(
      [],
    );
    const ended: RecurrenceRule = { freq: "DAILY", startDate: "2026-01-01", endDate: "2026-01-31" };
    expect(between(ended, "2026-02-01", "2026-02-28")).toEqual([]);
  });
});

describe("WEEKLY", () => {
  it("defaults to startDate's weekday", () => {
    // 2026-11-14 is a Saturday.
    expect(
      between({ freq: "WEEKLY", startDate: "2026-11-14" }, "2026-11-01", "2026-11-30"),
    ).toEqual(["2026-11-14", "2026-11-21", "2026-11-28"]);
  });

  it("supports multiple weekdays (Mon/Wed/Fri)", () => {
    const rule: RecurrenceRule = { freq: "WEEKLY", startDate: "2026-11-09", byWeekday: [1, 3, 5] };
    expect(between(rule, "2026-11-09", "2026-11-15")).toEqual([
      "2026-11-09",
      "2026-11-11",
      "2026-11-13",
    ]);
  });

  it("counts every-other-week from the week containing startDate", () => {
    // Starts Wednesday 2026-11-11, so Monday 11-09 of week 0 is before the start.
    const rule: RecurrenceRule = {
      freq: "WEEKLY",
      interval: 2,
      startDate: "2026-11-11",
      byWeekday: [1, 3],
    };
    expect(between(rule, "2026-11-09", "2026-11-30")).toEqual([
      "2026-11-11",
      "2026-11-23",
      "2026-11-25",
    ]);
  });

  it("keeps a Sunday in the same week as the preceding Monday", () => {
    const rule: RecurrenceRule = {
      freq: "WEEKLY",
      interval: 2,
      startDate: "2026-11-09",
      byWeekday: [0, 1],
    };
    // Week 0 = Nov 9–15 (Mon 9, Sun 15). Week 1 is skipped. Week 2 = Nov 23–29.
    expect(between(rule, "2026-11-09", "2026-11-30")).toEqual([
      "2026-11-09",
      "2026-11-15",
      "2026-11-23",
      "2026-11-29",
    ]);
  });
});

describe("MONTHLY / QUARTERLY / ANNUAL", () => {
  it("clamps the 31st to shorter months", () => {
    expect(
      between({ freq: "MONTHLY", startDate: "2026-01-31" }, "2026-01-01", "2026-06-30"),
    ).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30"]);
  });

  it("supports the last day of the month, including leap February", () => {
    const rule: RecurrenceRule = { freq: "MONTHLY", startDate: "2028-01-01", byMonthDay: -1 };
    expect(between(rule, "2028-01-01", "2028-03-31")).toEqual([
      "2028-01-31",
      "2028-02-29",
      "2028-03-31",
    ]);
  });

  it("skips a first-month day that falls before startDate", () => {
    const rule: RecurrenceRule = { freq: "MONTHLY", startDate: "2026-01-20", byMonthDay: 10 };
    expect(between(rule, "2026-01-01", "2026-03-31")).toEqual(["2026-02-10", "2026-03-10"]);
  });

  it("handles every-N-months with a window that starts mid-series", () => {
    const rule: RecurrenceRule = { freq: "MONTHLY", interval: 2, startDate: "2026-01-15" };
    // Cycle months: Jan, Mar, May, Jul, Sep…
    expect(between(rule, "2026-06-01", "2026-09-30")).toEqual(["2026-07-15", "2026-09-15"]);
  });

  it("repeats quarterly from the start month", () => {
    expect(
      between({ freq: "QUARTERLY", startDate: "2026-01-15" }, "2026-01-01", "2026-12-31"),
    ).toEqual(["2026-01-15", "2026-04-15", "2026-07-15", "2026-10-15"]);
  });

  it("moves an annual Feb 29 chore to Feb 28 in non-leap years", () => {
    expect(
      between({ freq: "ANNUAL", startDate: "2024-02-29" }, "2024-01-01", "2028-12-31"),
    ).toEqual(["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
  });

  it("matches the design doc example: monthly on the 15th", () => {
    const closet: RecurrenceRule = { freq: "MONTHLY", startDate: "2026-11-15", byMonthDay: 15 };
    expect(occursOn(closet, d("2026-12-15"))).toBe(true);
    expect(occursOn(closet, d("2026-12-16"))).toBe(false);
  });
});

describe("validation", () => {
  it("accepts a valid rule", () => {
    expect(
      validateRecurrenceRule({
        freq: "WEEKLY",
        startDate: "2026-11-09",
        byWeekday: [1, 3],
        timeOfDay: "07:00",
      }),
    ).toEqual([]);
  });

  it.each<[string, RecurrenceRule]>([
    ["bad freq", { freq: "HOURLY" as never, startDate: "2026-01-01" }],
    ["zero interval", { freq: "DAILY", interval: 0, startDate: "2026-01-01" }],
    ["fractional interval", { freq: "DAILY", interval: 1.5, startDate: "2026-01-01" }],
    ["bad startDate", { freq: "DAILY", startDate: "2026-02-30" }],
    ["end before start", { freq: "DAILY", startDate: "2026-02-01", endDate: "2026-01-01" }],
    ["byWeekday on monthly", { freq: "MONTHLY", startDate: "2026-01-01", byWeekday: [1] }],
    ["empty byWeekday", { freq: "WEEKLY", startDate: "2026-01-01", byWeekday: [] }],
    ["weekday 7", { freq: "WEEKLY", startDate: "2026-01-01", byWeekday: [7] }],
    ["duplicate weekdays", { freq: "WEEKLY", startDate: "2026-01-01", byWeekday: [1, 1] }],
    ["byMonthDay on weekly", { freq: "WEEKLY", startDate: "2026-01-01", byMonthDay: 1 }],
    ["byMonthDay 0", { freq: "MONTHLY", startDate: "2026-01-01", byMonthDay: 0 }],
    ["byMonthDay 32", { freq: "MONTHLY", startDate: "2026-01-01", byMonthDay: 32 }],
    ["bad timeOfDay", { freq: "DAILY", startDate: "2026-01-01", timeOfDay: "25:00" }],
  ])("rejects %s", (_label, rule) => {
    expect(validateRecurrenceRule(rule)).not.toEqual([]);
    expect(() => occurrencesBetween(rule, d("2026-01-01"), d("2026-01-31"))).toThrow(RangeError);
  });

  it("rejects reversed and oversized windows", () => {
    const rule: RecurrenceRule = { freq: "DAILY", startDate: "2026-01-01" };
    expect(() => between(rule, "2026-02-01", "2026-01-01")).toThrow(RangeError);
    expect(() => between(rule, "2026-01-01", "2040-01-01")).toThrow(RangeError);
  });
});
