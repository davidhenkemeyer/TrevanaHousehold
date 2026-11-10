import { describe, expect, it } from "vitest";
import {
  type PlanMember,
  type PlanOccurrence,
  type WeeklyCapacity,
  capacityOn,
  planAssignments,
} from "./assignment.js";
import { type PlainDate, addDays, parsePlainDate as d } from "./calendar.js";

function everyDay(minutes: number): WeeklyCapacity {
  return {
    sun: minutes,
    mon: minutes,
    tue: minutes,
    wed: minutes,
    thu: minutes,
    fri: minutes,
    sat: minutes,
  };
}

const MON = d("2026-11-09");

let seq = 0;
function occ(overrides: Partial<PlanOccurrence> & Pick<PlanOccurrence, "mode">): PlanOccurrence {
  seq++;
  return {
    key: `k${seq}`,
    choreId: `chore${seq}`,
    date: MON,
    effortMinutes: 10,
    priority: "NORMAL",
    pool: [],
    ...overrides,
  };
}

/** Total minutes assigned to each member on a date, from the plan's load summary. */
function loadOn(plan: ReturnType<typeof planAssignments>, date: PlainDate): Record<string, number> {
  return Object.fromEntries(
    plan.load.filter((l) => l.date === date).map((l) => [l.memberId, l.assignedMinutes]),
  );
}

describe("capacityOn", () => {
  it("reads the weekday's minutes", () => {
    const cap: WeeklyCapacity = { ...everyDay(30), sat: 90 };
    expect(capacityOn(cap, d("2026-11-14"))).toBe(90); // Saturday
    expect(capacityOn(cap, MON)).toBe(30);
  });
});

describe("AUTO", () => {
  const mom: PlanMember = { id: "mom", weeklyCapacity: everyDay(60) };
  const kid: PlanMember = { id: "kid", weeklyCapacity: everyDay(15) };

  it("spreads work in proportion to capacity", () => {
    const occurrences = Array.from({ length: 15 }, () => occ({ mode: "AUTO", effortMinutes: 5 }));
    const plan = planAssignments({ members: [mom, kid], occurrences });
    expect(loadOn(plan, MON)).toEqual({ mom: 60, kid: 15 });
    expect(plan.assignments.every((a) => !a.overCapacity)).toBe(true);
  });

  it("skips members with zero capacity that day", () => {
    const awayOnSaturday: PlanMember = { id: "kid", weeklyCapacity: { ...everyDay(60), sat: 0 } };
    const plan = planAssignments({
      members: [awayOnSaturday, { id: "mom", weeklyCapacity: everyDay(30) }],
      occurrences: [occ({ mode: "AUTO", date: d("2026-11-14") })],
    });
    expect(plan.assignments[0]?.assigneeIds).toEqual(["mom"]);
  });

  it("assigns anyway and flags overCapacity when nobody has room", () => {
    const plan = planAssignments({
      members: [kid, { id: "dad", weeklyCapacity: everyDay(5) }],
      occurrences: [occ({ mode: "AUTO", effortMinutes: 20 })],
    });
    // Neither fits; kid has the most minutes left (15 vs 5).
    expect(plan.assignments[0]).toMatchObject({ assigneeIds: ["kid"], overCapacity: true });
  });

  it("breaks ties by who did the chore least recently", () => {
    const plan = planAssignments({
      members: [
        { id: "a", weeklyCapacity: everyDay(30) },
        { id: "b", weeklyCapacity: everyDay(30) },
      ],
      occurrences: [occ({ mode: "AUTO", choreId: "dishes" })],
      history: { lastAssignedOn: { dishes: { a: "2026-11-08", b: "2026-11-01" } } },
    });
    expect(plan.assignments[0]?.assigneeIds).toEqual(["b"]);
  });

  it("alternates a daily chore between equally available members", () => {
    const occurrences = [0, 1, 2, 3].map((i) =>
      occ({ mode: "AUTO", choreId: "dishes", date: addDays(MON, i) }),
    );
    const plan = planAssignments({
      members: [
        { id: "a", weeklyCapacity: everyDay(30) },
        { id: "b", weeklyCapacity: everyDay(30) },
      ],
      occurrences,
    });
    expect(plan.assignments.map((a) => a.assigneeIds[0])).toEqual(["a", "b", "a", "b"]);
  });

  it("counts load already assigned by earlier runs", () => {
    const plan = planAssignments({
      members: [mom, kid],
      occurrences: [occ({ mode: "AUTO", effortMinutes: 10 })],
      history: { existingLoad: { [MON]: { mom: 55 } } },
    });
    expect(plan.assignments[0]?.assigneeIds).toEqual(["kid"]);
  });

  it("only considers the pool when one is given", () => {
    const plan = planAssignments({
      members: [mom, kid],
      occurrences: [occ({ mode: "AUTO", pool: ["kid"] })],
    });
    expect(plan.assignments[0]?.assigneeIds).toEqual(["kid"]);
  });

  it("places urgent and larger chores first", () => {
    // Kid has room for exactly one 15-minute chore; the HIGH one should claim it first.
    const low = occ({ mode: "AUTO", effortMinutes: 15, priority: "LOW", pool: ["kid"] });
    const high = occ({ mode: "AUTO", effortMinutes: 15, priority: "HIGH", pool: ["kid"] });
    const plan = planAssignments({ members: [kid], occurrences: [low, high] });
    const byKey = new Map(plan.assignments.map((a) => [a.key, a]));
    expect(byKey.get(high.key)?.overCapacity).toBe(false);
    expect(byKey.get(low.key)?.overCapacity).toBe(true);
  });
});

describe("ROTATE", () => {
  const members = ["a", "b", "c"].map((id) => ({ id, weeklyCapacity: everyDay(30) }));

  it("continues from the last assignee and wraps around", () => {
    const occurrences = [0, 1, 2].map((i) =>
      occ({ mode: "ROTATE", choreId: "trash", date: addDays(MON, i), pool: ["a", "b", "c"] }),
    );
    const plan = planAssignments({
      members,
      occurrences,
      history: { lastRotationAssignee: { trash: "b" } },
    });
    expect(plan.assignments.map((a) => a.assigneeIds[0])).toEqual(["c", "a", "b"]);
  });

  it("restarts at the top of the pool if the last assignee left it", () => {
    const plan = planAssignments({
      members,
      occurrences: [occ({ mode: "ROTATE", choreId: "trash", pool: ["a", "b"] })],
      history: { lastRotationAssignee: { trash: "c" } },
    });
    expect(plan.assignments[0]?.assigneeIds).toEqual(["a"]);
  });

  it("ignores capacity but flags overload", () => {
    const plan = planAssignments({
      members: [{ id: "a", weeklyCapacity: everyDay(5) }],
      occurrences: [occ({ mode: "ROTATE", effortMinutes: 10 })],
    });
    expect(plan.assignments[0]).toMatchObject({ assigneeIds: ["a"], overCapacity: true });
  });
});

describe("FIXED", () => {
  const billy: PlanMember = { id: "billy", weeklyCapacity: everyDay(20) };
  const sally: PlanMember = { id: "sally", weeklyCapacity: everyDay(20) };

  it("assigns all owners and splits the effort (design doc: Billy and Sally)", () => {
    const plan = planAssignments({
      members: [billy, sally],
      occurrences: [occ({ mode: "FIXED", effortMinutes: 15, pool: ["billy", "sally"] })],
    });
    expect(plan.assignments[0]?.assigneeIds).toEqual(["billy", "sally"]);
    expect(loadOn(plan, MON)).toEqual({ billy: 8, sally: 8 }); // ceil(15 / 2)
  });

  it("is planned before AUTO chores, which fill in around it", () => {
    const plan = planAssignments({
      members: [billy, sally],
      occurrences: [
        occ({ mode: "AUTO", effortMinutes: 10, key: "auto" }),
        occ({ mode: "FIXED", effortMinutes: 20, pool: ["billy"], key: "fixed" }),
      ],
    });
    const auto = plan.assignments.find((a) => a.key === "auto");
    expect(auto?.assigneeIds).toEqual(["sally"]);
  });
});

describe("unassignable occurrences", () => {
  const members = [{ id: "a", weeklyCapacity: everyDay(30) }];

  it("reports a FIXED chore with no owners", () => {
    const plan = planAssignments({ members, occurrences: [occ({ mode: "FIXED", key: "x" })] });
    expect(plan.unassigned).toEqual([{ key: "x", reason: "NO_ELIGIBLE_MEMBERS" }]);
    expect(plan.assignments).toEqual([]);
  });

  it("reports a pool whose members have all left", () => {
    const plan = planAssignments({
      members,
      occurrences: [occ({ mode: "AUTO", pool: ["gone"], key: "y" })],
    });
    expect(plan.unassigned).toEqual([{ key: "y", reason: "NO_ELIGIBLE_MEMBERS" }]);
  });
});

describe("determinism and validation", () => {
  it("produces the same plan regardless of input order", () => {
    const members = [
      { id: "mom", weeklyCapacity: everyDay(45) },
      { id: "kid", weeklyCapacity: everyDay(20) },
    ];
    const occurrences = [0, 1, 2, 3, 4, 5].flatMap((i) => [
      occ({ mode: "AUTO", date: addDays(MON, i % 3), effortMinutes: 5 + i }),
      occ({ mode: "ROTATE", choreId: "trash", date: addDays(MON, i % 3), key: `r${i}` }),
    ]);
    const normalize = (p: ReturnType<typeof planAssignments>) =>
      [...p.assignments].sort((x, y) => (x.key < y.key ? -1 : 1));
    const forward = planAssignments({ members, occurrences });
    const backward = planAssignments({ members, occurrences: [...occurrences].reverse() });
    expect(normalize(backward)).toEqual(normalize(forward));
  });

  it("reports capacity vs. load for every member on planned days", () => {
    const plan = planAssignments({
      members: [
        { id: "a", weeklyCapacity: everyDay(30) },
        { id: "b", weeklyCapacity: everyDay(10) },
      ],
      occurrences: [occ({ mode: "FIXED", pool: ["a"], effortMinutes: 12 })],
    });
    expect(plan.load).toEqual([
      { date: MON, memberId: "a", capacityMinutes: 30, assignedMinutes: 12 },
      { date: MON, memberId: "b", capacityMinutes: 10, assignedMinutes: 0 },
    ]);
  });

  it("rejects bad input", () => {
    const members = [{ id: "a", weeklyCapacity: everyDay(30) }];
    const dup = occ({ mode: "AUTO" });
    expect(() => planAssignments({ members, occurrences: [dup, dup] })).toThrow(
      /Duplicate occurrence/,
    );
    expect(() =>
      planAssignments({ members, occurrences: [occ({ mode: "AUTO", effortMinutes: -1 })] }),
    ).toThrow(RangeError);
    expect(() => planAssignments({ members: [...members, ...members], occurrences: [] })).toThrow(
      /Duplicate member/,
    );
    expect(() =>
      planAssignments({
        members: [{ id: "x", weeklyCapacity: { ...everyDay(10), tue: -5 } }],
        occurrences: [],
      }),
    ).toThrow(/invalid tue capacity/);
  });
});
