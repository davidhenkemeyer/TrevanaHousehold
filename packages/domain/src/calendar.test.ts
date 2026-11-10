import { describe, expect, it } from "vitest";
import {
  addDays,
  dateInMonthClamped,
  daysBetween,
  daysInMonth,
  isLeapYear,
  isPlainDate,
  monthIndexOf,
  parsePlainDate as d,
  plainDateFromParts,
  startOfWeekMonday,
  weekdayOf,
} from "./calendar.js";

describe("parsing and validation", () => {
  it("accepts real dates", () => {
    expect(isPlainDate("2026-11-10")).toBe(true);
    expect(isPlainDate("2024-02-29")).toBe(true);
  });

  it.each(["2025-02-29", "2026-13-01", "2026-04-31", "2026-1-5", "20261110", "", "1999-00-10"])(
    "rejects %j",
    (value) => {
      expect(isPlainDate(value)).toBe(false);
      expect(() => d(value)).toThrow(RangeError);
    },
  );

  it("rejects non-strings and out-of-range years", () => {
    expect(isPlainDate(20261110)).toBe(false);
    expect(isPlainDate("0999-01-01")).toBe(false);
    expect(() => plainDateFromParts(2026, 2, 30)).toThrow(RangeError);
  });
});

describe("leap years and month lengths", () => {
  it.each([
    [2024, true],
    [2026, false],
    [1900, false],
    [2000, true],
  ])("isLeapYear(%i) = %s", (year, expected) => {
    expect(isLeapYear(year)).toBe(expected);
  });

  it("knows month lengths", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe("arithmetic", () => {
  it("adds days across month, year, and leap-day boundaries", () => {
    expect(addDays(d("2026-12-31"), 1)).toBe("2027-01-01");
    expect(addDays(d("2024-02-28"), 1)).toBe("2024-02-29");
    expect(addDays(d("2026-03-01"), -1)).toBe("2026-02-28");
    expect(addDays(d("2026-11-10"), 365)).toBe("2027-11-10");
  });

  it("rejects fractional day counts", () => {
    expect(() => addDays(d("2026-01-01"), 1.5)).toThrow(RangeError);
  });

  it("counts days between dates (signed)", () => {
    expect(daysBetween(d("2026-01-01"), d("2026-12-31"))).toBe(364);
    expect(daysBetween(d("2024-01-01"), d("2025-01-01"))).toBe(366);
    expect(daysBetween(d("2026-01-10"), d("2026-01-01"))).toBe(-9);
  });
});

describe("weekdays", () => {
  it("computes weekdays (0 = Sunday)", () => {
    expect(weekdayOf(d("2026-11-10"))).toBe(2); // Tuesday
    expect(weekdayOf(d("2026-11-15"))).toBe(0); // Sunday
    expect(weekdayOf(d("1970-01-01"))).toBe(4); // Thursday
    expect(weekdayOf(d("1969-12-28"))).toBe(0); // before the epoch
  });

  it("finds the Monday starting each week", () => {
    expect(startOfWeekMonday(d("2026-11-10"))).toBe("2026-11-09");
    expect(startOfWeekMonday(d("2026-11-09"))).toBe("2026-11-09");
    expect(startOfWeekMonday(d("2026-11-15"))).toBe("2026-11-09"); // Sunday belongs to the prior Monday
    expect(startOfWeekMonday(d("2027-01-01"))).toBe("2026-12-28");
  });
});

describe("month helpers", () => {
  it("clamps days past month end, and -1 means the last day", () => {
    const feb2026 = monthIndexOf(d("2026-02-01"));
    expect(dateInMonthClamped(feb2026, 31)).toBe("2026-02-28");
    expect(dateInMonthClamped(feb2026, -1)).toBe("2026-02-28");
    expect(dateInMonthClamped(feb2026, 15)).toBe("2026-02-15");
    expect(dateInMonthClamped(monthIndexOf(d("2028-02-01")), 30)).toBe("2028-02-29");
    expect(dateInMonthClamped(feb2026 + 11, 31)).toBe("2027-01-31"); // wraps the year
  });
});
