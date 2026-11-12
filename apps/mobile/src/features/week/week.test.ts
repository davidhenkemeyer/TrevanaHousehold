import type { PlainDate } from "@tenara/domain";
import { describe, expect, it } from "vitest";
import {
  capacityFromPreset,
  dayLabel,
  formatMinutes,
  loadFraction,
  shiftWeek,
  stepCapacity,
  weeklyTotal,
} from "./week";

describe("week helpers", () => {
  it("loadFraction caps at full and treats work on a day off as full", () => {
    expect(loadFraction(10, 20)).toBe(0.5);
    expect(loadFraction(30, 20)).toBe(1);
    expect(loadFraction(5, 0)).toBe(1);
    expect(loadFraction(0, 0)).toBe(0);
  });

  it("labels and shifts days", () => {
    expect(dayLabel("2026-11-10" as PlainDate)).toBe("Tue 10");
    expect(shiftWeek("2026-11-10" as PlainDate, -1)).toBe("2026-11-03");
  });

  it("builds and steps capacity", () => {
    const c = capacityFromPreset(20, 40);
    expect(c).toEqual({ sun: 40, mon: 20, tue: 20, wed: 20, thu: 20, fri: 20, sat: 40 });
    expect(weeklyTotal(c)).toBe(180);
    expect(stepCapacity(0, -1)).toBe(0);
    expect(stepCapacity(20, 1)).toBe(25);
    expect(stepCapacity(600, 1)).toBe(600);
  });

  it("formats minutes", () => {
    expect([0, 45, 60, 150].map(formatMinutes)).toEqual(["0 min", "45 min", "1 h", "2 h 30 min"]);
  });
});
