import { describe, expect, it } from "vitest";
import { type PlainDate, parsePlainDate } from "./calendar.js";
import { defaultWeeklyCapacity } from "./defaults.js";
import { describeRecurrence } from "./describe.js";
import { occurrencesBetween, validateRecurrenceRule } from "./recurrence.js";
import {
  type AgeMember,
  ROOMS,
  STARTER_CHORES,
  findStarterChore,
  oldEnoughFor,
  starterDeadlineMinutes,
  starterEligible,
  starterRecurrence,
  suggestedStarterIds,
} from "./starterChores.js";

const today: PlainDate = parsePlainDate("2026-11-11");
const template = (id: string) => {
  const t = findStarterChore(id);
  if (!t) throw new Error(`no template ${id}`);
  return t;
};

const mom: AgeMember = { id: "mom", role: "PARENT", ageGroup: null };
const little: AgeMember = { id: "little", role: "CHILD", ageGroup: "LITTLE" };
const tween: AgeMember = { id: "tween", role: "CHILD", ageGroup: "TWEEN" };
const unset: AgeMember = { id: "unset", role: "CHILD", ageGroup: null };

describe("starter chores", () => {
  it("has unique ids, known rooms, and at least a few chores per room", () => {
    const ids = STARTER_CHORES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const room of ROOMS) {
      expect(STARTER_CHORES.filter((t) => t.room === room).length).toBeGreaterThanOrEqual(4);
    }
  });

  it.each(STARTER_CHORES.map((t) => [t.id, t] as const))(
    "%s has a valid schedule, deadline, and effort",
    (_id, t) => {
      const rule = starterRecurrence(t, today);
      expect(validateRecurrenceRule(rule)).toEqual([]);
      expect(describeRecurrence(rule)).not.toBe("Invalid schedule");
      // It comes up within the next quarter.
      expect(occurrencesBetween(rule, today, parsePlainDate("2027-02-15")).length).toBeGreaterThan(
        0,
      );
      const deadline = starterDeadlineMinutes(t);
      expect(deadline).toBeGreaterThanOrEqual(1);
      expect(deadline).toBeLessThanOrEqual(90 * 24 * 60);
      expect(t.effortMinutes).toBeGreaterThanOrEqual(1);
      expect(t.effortMinutes).toBeLessThanOrEqual(480);
      expect(t.name.length).toBeLessThanOrEqual(80);
    },
  );

  it("builds rules from cadences", () => {
    expect(starterRecurrence(template("make-bed"), today)).toEqual({
      freq: "DAILY",
      startDate: "2026-11-11",
      timeOfDay: "07:00",
    });
    expect(starterRecurrence(template("change-sheets"), today)).toEqual({
      freq: "WEEKLY",
      interval: 2,
      startDate: "2026-11-11",
      byWeekday: [0],
    });
    expect(starterRecurrence(template("clean-fridge"), today)).toEqual({
      freq: "MONTHLY",
      startDate: "2026-11-11",
      byMonthDay: 1,
    });
  });

  it("gives daily chores until the end of the day and rarer ones more room", () => {
    expect(starterDeadlineMinutes(template("make-bed"))).toBe(17 * 60); // 7:00 to midnight
    expect(starterDeadlineMinutes(template("take-out-trash"))).toBe(7 * 60); // twice a week
    expect(starterDeadlineMinutes(template("sweep-kitchen"))).toBe(2 * 24 * 60);
    expect(starterDeadlineMinutes(template("clean-fridge"))).toBe(7 * 24 * 60);
    expect(starterDeadlineMinutes(template("clean-oven"))).toBe(14 * 24 * 60);
  });

  it("matches chores to ages; parents can do anything; unset kids count as 7–10", () => {
    expect(oldEnoughFor(template("clean-oven"), mom)).toBe(true);
    expect(oldEnoughFor(template("clean-oven"), tween)).toBe(false);
    expect(oldEnoughFor(template("load-dishwasher"), little)).toBe(false);
    expect(oldEnoughFor(template("load-dishwasher"), unset)).toBe(true);
    expect(oldEnoughFor(template("clean-toilet"), unset)).toBe(false);
  });

  it("pools only the members old enough, or everyone when all qualify", () => {
    expect(starterEligible(template("make-bed"), [mom, little, tween])).toEqual([]);
    expect(starterEligible(template("clean-toilet"), [mom, little, tween])).toEqual([
      "mom",
      "tween",
    ]);
    expect(starterEligible(template("clean-oven"), [mom, tween])).toEqual(["mom"]);
  });

  it("suggests kid-friendly chores in the picked rooms only", () => {
    const ids = suggestedStarterIds(["KITCHEN", "PETS"], [mom, little]);
    expect(ids).toContain("feed-pet-morning");
    // Loading the dishwasher is for 7+, and the only kid is 4–6.
    expect(ids).not.toContain("load-dishwasher");
    expect(ids).not.toContain("make-bed"); // Everyday wasn't picked
    expect(suggestedStarterIds(["KITCHEN"], [mom, tween])).toContain("load-dishwasher");
    // Parents only: nothing to suggest.
    expect(suggestedStarterIds(["KITCHEN"], [mom])).toEqual([]);
  });
});

describe("defaultWeeklyCapacity", () => {
  it("scales kids' time by age and keeps the old default when unset", () => {
    expect(defaultWeeklyCapacity("CHILD")).toMatchObject({ mon: 20, sat: 40 });
    expect(defaultWeeklyCapacity("CHILD", "LITTLE")).toMatchObject({ mon: 10, sat: 20 });
    expect(defaultWeeklyCapacity("CHILD", "TEEN")).toMatchObject({ mon: 30, sun: 60 });
    expect(defaultWeeklyCapacity("PARENT", "TEEN")).toMatchObject({ mon: 60, sat: 60 });
  });
});
