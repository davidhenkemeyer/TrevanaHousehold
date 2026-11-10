import { describe, expect, it } from "vitest";
import { parsePlainDate as d } from "./calendar.js";
import {
  type ScheduleChore,
  expandOccurrences,
  minutesPerAssignee,
  occurrenceKey,
  planningWindow,
} from "./schedule.js";

const daily: ScheduleChore = {
  id: "dishes",
  recurrence: { freq: "DAILY", startDate: "2026-11-01" },
  effortMinutes: 15,
  priority: "NORMAL",
  mode: "AUTO",
  pool: [],
};

describe("planningWindow", () => {
  it("covers today plus the next six days", () => {
    expect(planningWindow(d("2026-11-10"))).toEqual({ from: "2026-11-10", to: "2026-11-16" });
  });
});

describe("minutesPerAssignee", () => {
  it("splits effort and rounds up", () => {
    expect(minutesPerAssignee(15, 2)).toBe(8);
    expect(minutesPerAssignee(15, 1)).toBe(15);
    expect(minutesPerAssignee(0, 3)).toBe(0);
    expect(minutesPerAssignee(10, 0)).toBe(0);
  });
});

describe("expandOccurrences", () => {
  it("produces one planner occurrence per chore date in the window", () => {
    const occ = expandOccurrences([daily], d("2026-11-10"), d("2026-11-12"), new Set());
    expect(occ.map((o) => o.key)).toEqual([
      "dishes:2026-11-10",
      "dishes:2026-11-11",
      "dishes:2026-11-12",
    ]);
    expect(occ[0]).toMatchObject({ choreId: "dishes", effortMinutes: 15, mode: "AUTO" });
  });

  it("skips dates that already have an instance", () => {
    const existing = new Set([occurrenceKey("dishes", d("2026-11-11"))]);
    const occ = expandOccurrences([daily], d("2026-11-10"), d("2026-11-12"), existing);
    expect(occ.map((o) => o.date)).toEqual(["2026-11-10", "2026-11-12"]);
  });

  it("combines several chores", () => {
    const trash: ScheduleChore = {
      ...daily,
      id: "trash",
      recurrence: { freq: "WEEKLY", startDate: "2026-11-09", byWeekday: [3] }, // Wednesdays
    };
    const occ = expandOccurrences([daily, trash], d("2026-11-10"), d("2026-11-12"), new Set());
    expect(occ.filter((o) => o.choreId === "trash").map((o) => o.date)).toEqual(["2026-11-11"]);
    expect(occ).toHaveLength(4);
  });
});
