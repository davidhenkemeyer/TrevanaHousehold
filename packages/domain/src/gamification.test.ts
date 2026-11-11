import { describe, expect, it } from "vitest";
import { parsePlainDate as d } from "./calendar.js";
import {
  type ApprovalRecord,
  type DayInstance,
  type DayOutcome,
  cleanWeeks,
  dayOutcome,
  earnedBadges,
  goalProgress,
  isMasteryKey,
  levelFor,
  masteryKey,
  streakOf,
  xpFor,
  xpToReach,
} from "./gamification.js";

describe("XP and levels", () => {
  it("gives 1 XP per minute of effort, at least 5, unless the chore overrides it", () => {
    expect(xpFor(15)).toBe(15);
    expect(xpFor(2)).toBe(5);
    expect(xpFor(15, 40)).toBe(40);
    expect(xpFor(15, null)).toBe(15);
  });

  it("uses a gentle level curve", () => {
    expect([1, 2, 3, 5, 10].map(xpToReach)).toEqual([0, 50, 150, 500, 2250]);
    expect(levelFor(0)).toEqual({ level: 1, xpIntoLevel: 0, xpForNextLevel: 50 });
    expect(levelFor(49).level).toBe(1);
    expect(levelFor(50)).toEqual({ level: 2, xpIntoLevel: 0, xpForNextLevel: 100 });
    expect(levelFor(160)).toEqual({ level: 3, xpIntoLevel: 10, xpForNextLevel: 150 });
    expect(levelFor(2250).level).toBe(10);
    expect(levelFor(-5).level).toBe(1);
  });
});

describe("streaks", () => {
  const due = new Date("2026-11-10T23:00:00Z");
  const before = new Date("2026-11-10T20:00:00Z");
  const after = new Date("2026-11-11T01:00:00Z");
  const inst = (overrides: Partial<DayInstance>): DayInstance => ({
    status: "APPROVED",
    dueAt: due,
    firstSubmittedAt: before,
    ...overrides,
  });

  it("counts a day when everything was handed in on time", () => {
    expect(dayOutcome([inst({}), inst({ status: "PENDING_REVIEW" })], after)).toBe("DONE");
    // Sent back for rework later still counts: the first hand-in was on time.
    expect(dayOutcome([inst({ status: "NEEDS_REWORK" })], after)).toBe("DONE");
  });

  it("skips days with nothing assigned, and canceled chores", () => {
    expect(dayOutcome([], after)).toBe("NONE");
    expect(dayOutcome([inst({ status: "CANCELED", firstSubmittedAt: null })], after)).toBe("NONE");
  });

  it("waits while something can still be handed in", () => {
    expect(dayOutcome([inst({}), inst({ status: "NEW", firstSubmittedAt: null })], before)).toBe(
      "PENDING",
    );
  });

  it("misses a day when something wasn't handed in on time, or was rejected", () => {
    expect(dayOutcome([inst({ status: "NEW", firstSubmittedAt: null })], after)).toBe("MISSED");
    expect(dayOutcome([inst({ firstSubmittedAt: after })], after)).toBe("MISSED");
    expect(dayOutcome([inst({ status: "REJECTED" })], before)).toBe("MISSED");
  });

  const days = (pattern: string): DayOutcome[] =>
    [...pattern].map((c) =>
      c === "D" ? "DONE" : c === "M" ? "MISSED" : c === "P" ? "PENDING" : "NONE",
    );

  it("counts done days, skipping empty and pending ones", () => {
    expect(streakOf(days("DD.DP"))).toEqual({ days: 3, saves: 0, best: 3 });
  });

  it("ends the streak on a missed day when there's no save", () => {
    expect(streakOf(days("DDDMDD"))).toEqual({ days: 2, saves: 0, best: 3 });
  });

  it("earns a save every 7 days, uses it on a missed day, and holds at most 2", () => {
    expect(streakOf(days("DDDDDDD"))).toMatchObject({ days: 7, saves: 1 });
    expect(streakOf(days("DDDDDDDMD"))).toEqual({ days: 8, saves: 0, best: 8 });
    expect(streakOf(days("D".repeat(21)))).toMatchObject({ days: 21, saves: 2 });
    // Two misses use both saves; a third ends the streak.
    expect(streakOf(days(`${"D".repeat(14)}MMD`))).toEqual({ days: 15, saves: 0, best: 15 });
    expect(streakOf(days(`${"D".repeat(14)}MMMD`))).toEqual({ days: 1, saves: 0, best: 14 });
  });

  it("counts finished clean weeks only", () => {
    // Mon 2 Nov – Sun 8 Nov 2026, then the current week.
    const week = (start: string, outcomes: DayOutcome[]) =>
      outcomes.map((outcome, i) => ({
        date: d(`2026-11-${String(Number(start) + i).padStart(2, "0")}`),
        outcome,
      }));
    const today = d("2026-11-10");
    const clean = week("02", ["DONE", "NONE", "DONE", "DONE", "NONE", "NONE", "DONE"]);
    expect(cleanWeeks(clean, today)).toBe(1);
    const missed = week("02", ["DONE", "MISSED", "DONE", "DONE", "NONE", "NONE", "DONE"]);
    expect(cleanWeeks(missed, today)).toBe(0);
    expect(cleanWeeks(week("02", Array(7).fill("NONE")), today)).toBe(0);
    // This week isn't over yet.
    expect(cleanWeeks(week("09", ["DONE", "DONE"]), today)).toBe(0);
  });
});

describe("badges", () => {
  const approval = (overrides: Partial<ApprovalRecord> = {}): ApprovalRecord => ({
    choreId: "dishes",
    choreName: "Dishes",
    reworked: false,
    fromJobBoard: false,
    ...overrides,
  });
  const keys = (
    approvals: ApprovalRecord[],
    extra: { bestStreak?: number; cleanWeeks?: number } = {},
  ) => earnedBadges({ approvals, bestStreak: 0, cleanWeeks: 0, ...extra }).map((b) => b.key);

  it("awards milestones", () => {
    expect(keys([])).toEqual([]);
    expect(keys([approval()])).toEqual(["FIRST_CHORE"]);
    const ten = Array.from({ length: 10 }, (_, i) => approval({ choreId: `c${i}` }));
    expect(keys(ten)).toEqual(["FIRST_CHORE", "TEN_CHORES", "RIGHT_FIRST_TIME"]);
  });

  it("awards streak, clean-week, and helper badges", () => {
    expect(keys([], { bestStreak: 7 })).toEqual(["STREAK_7"]);
    expect(keys([], { bestStreak: 30 })).toEqual(["STREAK_7", "STREAK_30"]);
    expect(keys([], { cleanWeeks: 1 })).toEqual(["CLEAN_WEEK"]);
    expect(keys([approval({ fromJobBoard: true })])).toContain("HELPER");
  });

  it("needs 10 approvals in a row without a redo", () => {
    const nine = Array.from({ length: 9 }, (_, i) => approval({ choreId: `c${i}` }));
    expect(keys([...nine, approval({ reworked: true }), approval()])).not.toContain(
      "RIGHT_FIRST_TIME",
    );
  });

  it("awards mastery per chore, counting only approvals without rework", () => {
    const dishes = Array.from({ length: 10 }, () => approval());
    const reworked = approval({ reworked: true });
    const earned = earnedBadges({
      approvals: [...dishes.slice(0, 9), reworked, approval({ choreId: "bed", choreName: "Bed" })],
      bestStreak: 0,
      cleanWeeks: 0,
    });
    expect(earned.some((b) => isMasteryKey(b.key))).toBe(false);
    const master = earnedBadges({ approvals: dishes, bestStreak: 0, cleanWeeks: 0 }).find((b) =>
      isMasteryKey(b.key),
    );
    expect(master).toEqual({
      key: masteryKey("dishes"),
      label: "Dishes master",
      choreId: "dishes",
    });
  });
});

describe("family goal", () => {
  it("reports progress, capped at 100%", () => {
    expect(goalProgress(250, 1000)).toEqual({ percent: 25, reached: false });
    expect(goalProgress(1000, 1000)).toEqual({ percent: 100, reached: true });
    expect(goalProgress(1500, 1000)).toEqual({ percent: 100, reached: true });
  });
});
