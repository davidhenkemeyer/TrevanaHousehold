import { describe, expect, it } from "vitest";
import { planAssignments } from "./assignment.js";
import { parsePlainDate as d } from "./calendar.js";
import { shouldExpireOpen, shouldMarkLate } from "./lateness.js";
import {
  balanceOf,
  canRedeem,
  earnings,
  formatAmount,
  parseMoney,
  paysByDefault,
} from "./rewards.js";
import { type TransitionContext, applyAction, availableActions } from "./stateMachine.js";

describe("reward arithmetic", () => {
  it("splits a shared chore's reward in whole units that add up", () => {
    expect(earnings(500, ["sally", "billy"])).toEqual(
      new Map([
        ["billy", 250],
        ["sally", 250],
      ]),
    );
    // The remainder goes to the first assignee by id.
    expect(earnings(5, ["sally", "billy"])).toEqual(
      new Map([
        ["billy", 3],
        ["sally", 2],
      ]),
    );
    // One point between two: nobody gets a zero entry.
    expect(earnings(1, ["sally", "billy"])).toEqual(new Map([["billy", 1]]));
  });

  it("earns nothing without a reward or an assignee", () => {
    expect(earnings(0, ["billy"]).size).toBe(0);
    expect(earnings(50, []).size).toBe(0);
  });

  it("sums balances, which may go negative after an advance", () => {
    expect(balanceOf([500, -200, 50])).toBe(350);
    expect(balanceOf([500, -800])).toBe(-300);
    expect(balanceOf([])).toBe(0);
  });

  it("only lets points be spent when they're there", () => {
    expect(canRedeem(50, 50)).toBe(true);
    expect(canRedeem(49, 50)).toBe(false);
    expect(canRedeem(-10, 5)).toBe(false);
    expect(canRedeem(50, 0)).toBe(false);
  });

  it("formats money and points", () => {
    expect(formatAmount("MONEY", "USD", 500)).toBe("$5.00");
    expect(formatAmount("MONEY", "USD", -150)).toBe("-$1.50");
    expect(formatAmount("MONEY", "GBP", 250)).toBe("£2.50");
    expect(formatAmount("MONEY", null, 5)).toBe("$0.05");
    expect(formatAmount("POINTS", null, 50)).toBe("50 pts");
    expect(formatAmount("POINTS", null, 1)).toBe("1 pt");
    expect(formatAmount("POINTS", null, -1)).toBe("-1 pt");
  });

  it("parses typed money amounts into cents", () => {
    expect(parseMoney("5")).toBe(500);
    expect(parseMoney("5.5")).toBe(550);
    expect(parseMoney(" $12.34 ")).toBe(1234);
    expect(parseMoney("0.07")).toBe(7);
    expect(parseMoney("1.999")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("-5")).toBeNull();
    expect(parseMoney("10001")).toBeNull(); // over the maximum
    expect(parseMoney("")).toBeNull();
  });

  it("pays extra jobs by default, not routines", () => {
    expect(paysByDefault("EXTRA_JOB")).toBe(true);
    expect(paysByDefault("ROUTINE")).toBe(false);
  });
});

describe("job board", () => {
  const ctx = (overrides: Partial<TransitionContext>): TransitionContext => ({
    status: "NEW",
    actorRole: "CHILD",
    actorIsAssignee: false,
    requiresPhoto: false,
    hasPhoto: false,
    reviewPolicy: "REVIEW_EACH",
    ...overrides,
  });

  it("lets anyone in the pool claim an open job, parents included", () => {
    expect(applyAction("claim", ctx({ board: "OPEN", actorInPool: true }))).toEqual({
      ok: true,
      status: "NEW",
      releaseRewards: false,
      board: "CLAIMED",
    });
    expect(
      applyAction("claim", ctx({ board: "OPEN", actorInPool: true, actorRole: "PARENT" })),
    ).toMatchObject({ ok: true, board: "CLAIMED" });
  });

  it("refuses claims from outside the pool, even from a parent", () => {
    for (const actorRole of ["CHILD", "PARENT"] as const) {
      expect(
        applyAction("claim", ctx({ board: "OPEN", actorInPool: false, actorRole })),
      ).toMatchObject({ ok: false, code: "FORBIDDEN" });
    }
  });

  it("can't claim an ordinary chore or one already claimed", () => {
    expect(applyAction("claim", ctx({ actorInPool: true }))).toMatchObject({
      ok: false,
      code: "INVALID_TRANSITION",
    });
    expect(applyAction("claim", ctx({ board: "CLAIMED", actorInPool: true }))).toMatchObject({
      ok: false,
      code: "INVALID_TRANSITION",
    });
  });

  it("allows only claim and cancel while a job is on the board", () => {
    const open = ctx({ board: "OPEN", actorInPool: true, actorRole: "PARENT" });
    expect(availableActions(open).sort()).toEqual(["cancel", "claim"]);
    // In particular, a parent can't complete a job nobody holds (it would pay no one).
    expect(applyAction("complete", open)).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
    expect(availableActions(ctx({ board: "OPEN", actorInPool: true }))).toEqual(["claim"]);
  });

  it("lets the claimer or a parent give a job back before it's submitted", () => {
    const mine = ctx({ board: "CLAIMED", actorIsAssignee: true });
    for (const status of ["NEW", "IN_PROGRESS", "DEFERRED"] as const) {
      expect(applyAction("release", { ...mine, status })).toEqual({
        ok: true,
        status: "NEW",
        releaseRewards: false,
        board: "OPEN",
      });
    }
    expect(applyAction("release", { ...mine, status: "PENDING_REVIEW" })).toMatchObject({
      ok: false,
    });
    expect(applyAction("release", ctx({ board: "CLAIMED", actorRole: "PARENT" }))).toMatchObject({
      ok: true,
    });
    // A sibling can't give away someone else's job.
    expect(applyAction("release", ctx({ board: "CLAIMED" }))).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
  });

  it("never offers release on an ordinary chore", () => {
    expect(availableActions(ctx({ actorIsAssignee: true }))).not.toContain("release");
    expect(availableActions(ctx({ actorIsAssignee: true, board: "CLAIMED" }))).toContain("release");
  });

  it("expires unclaimed jobs at their deadline instead of marking them late", () => {
    const dueAt = new Date("2026-11-10T18:00:00Z");
    const before = new Date("2026-11-10T17:59:00Z");
    const after = new Date("2026-11-10T18:01:00Z");
    expect(shouldExpireOpen({ status: "NEW", board: "OPEN", dueAt }, before)).toBe(false);
    expect(shouldExpireOpen({ status: "NEW", board: "OPEN", dueAt }, after)).toBe(true);
    expect(shouldExpireOpen({ status: "NEW", board: "CLAIMED", dueAt }, after)).toBe(false);
    expect(shouldMarkLate({ status: "NEW", isLate: false, dueAt, board: "OPEN" }, after)).toBe(
      false,
    );
    // Once claimed, it goes late like any chore.
    expect(shouldMarkLate({ status: "NEW", isLate: false, dueAt, board: "CLAIMED" }, after)).toBe(
      true,
    );
  });

  it("plans open jobs with no assignee and charges nobody's capacity", () => {
    const everyDay = { sun: 20, mon: 20, tue: 20, wed: 20, thu: 20, fri: 20, sat: 20 };
    const plan = planAssignments({
      members: [{ id: "billy", weeklyCapacity: everyDay }],
      occurrences: [
        {
          key: "car",
          choreId: "car",
          date: d("2026-11-10"),
          effortMinutes: 45,
          priority: "NORMAL",
          mode: "OPEN",
          pool: [],
        },
      ],
    });
    expect(plan.assignments).toEqual([
      { key: "car", date: "2026-11-10", assigneeIds: [], overCapacity: false, open: true },
    ]);
    expect(plan.unassigned).toEqual([]);
    expect(plan.load.every((l) => l.assignedMinutes === 0)).toBe(true);
  });
});
