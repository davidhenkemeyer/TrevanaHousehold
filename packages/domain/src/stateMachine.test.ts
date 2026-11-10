import { describe, expect, it } from "vitest";
import {
  type ChoreAction,
  type ReviewPolicy,
  type TransitionContext,
  applyAction,
  availableActions,
  canBatchApprove,
} from "./stateMachine.js";
import type { ChoreStatus } from "./status.js";

/** A child acting on their own chore: no photo requirement, every completion reviewed. */
function child(status: ChoreStatus, overrides: Partial<TransitionContext> = {}): TransitionContext {
  return {
    status,
    actorRole: "CHILD",
    actorIsAssignee: true,
    requiresPhoto: false,
    hasPhoto: false,
    reviewPolicy: "REVIEW_EACH",
    ...overrides,
  };
}

function parent(
  status: ChoreStatus,
  overrides: Partial<TransitionContext> = {},
): TransitionContext {
  return { ...child(status), actorRole: "PARENT", actorIsAssignee: false, ...overrides };
}

describe("allowed transitions for the assignee", () => {
  it.each<[ChoreStatus, ChoreAction, ChoreStatus]>([
    ["NEW", "start", "IN_PROGRESS"],
    ["NEW", "defer", "DEFERRED"],
    ["DEFERRED", "start", "IN_PROGRESS"],
    ["DEFERRED", "reset", "NEW"],
    ["IN_PROGRESS", "reset", "NEW"],
    ["IN_PROGRESS", "complete", "PENDING_REVIEW"],
    ["NEEDS_REWORK", "start", "IN_PROGRESS"],
    ["NEEDS_REWORK", "complete", "PENDING_REVIEW"],
    ["NEW", "complete", "PENDING_REVIEW"], // one-tap "done" without starting first
  ])("%s --%s--> %s", (from, action, to) => {
    expect(applyAction(action, child(from))).toEqual({
      ok: true,
      status: to,
      releaseRewards: false,
    });
  });
});

describe("invalid transitions", () => {
  it.each<[ChoreStatus, ChoreAction]>([
    ["DEFERRED", "complete"], // must resume first
    ["NEW", "reset"],
    ["DEFERRED", "defer"],
    ["IN_PROGRESS", "start"],
    ["IN_PROGRESS", "defer"],
    ["PENDING_REVIEW", "start"],
    ["PENDING_REVIEW", "complete"],
    ["NEW", "approve"], // nothing submitted yet
    ["NEEDS_REWORK", "reject"],
  ])("%s cannot %s", (from, action) => {
    const result = applyAction(action, parent(from));
    expect(result).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
  });

  it.each<ChoreStatus>(["APPROVED", "REJECTED", "CANCELED"])(
    "%s is terminal for every action",
    (status) => {
      for (const action of ["start", "complete", "cancel", "approve", "reject"] as const) {
        expect(applyAction(action, parent(status))).toMatchObject({ ok: false, code: "TERMINAL" });
      }
    },
  );
});

describe("parent review", () => {
  it("approving releases rewards", () => {
    expect(applyAction("approve", parent("PENDING_REVIEW"))).toEqual({
      ok: true,
      status: "APPROVED",
      releaseRewards: true,
    });
  });

  it("requesting rework reopens the chore with HIGH priority", () => {
    expect(applyAction("requestRework", parent("PENDING_REVIEW"))).toEqual({
      ok: true,
      status: "NEEDS_REWORK",
      priority: "HIGH",
      releaseRewards: false,
    });
  });

  it("rejecting is final and forfeits the reward", () => {
    expect(applyAction("reject", parent("PENDING_REVIEW"))).toEqual({
      ok: true,
      status: "REJECTED",
      releaseRewards: false,
    });
  });

  it("a parent completing a chore skips review", () => {
    expect(applyAction("complete", parent("IN_PROGRESS"))).toEqual({
      ok: true,
      status: "APPROVED",
      releaseRewards: true,
    });
  });

  it("a parent may cancel from any non-terminal status", () => {
    for (const status of [
      "NEW",
      "IN_PROGRESS",
      "DEFERRED",
      "PENDING_REVIEW",
      "NEEDS_REWORK",
    ] as const) {
      expect(applyAction("cancel", parent(status))).toMatchObject({ ok: true, status: "CANCELED" });
    }
  });
});

describe("review policies", () => {
  it("AUTO_APPROVE approves a child's completion immediately", () => {
    expect(applyAction("complete", child("IN_PROGRESS", { reviewPolicy: "AUTO_APPROVE" }))).toEqual(
      { ok: true, status: "APPROVED", releaseRewards: true },
    );
  });

  it("AUTO_APPROVE still requires the photo when one is required", () => {
    const ctx = child("IN_PROGRESS", { reviewPolicy: "AUTO_APPROVE", requiresPhoto: true });
    expect(applyAction("complete", ctx)).toMatchObject({ ok: false, code: "PHOTO_REQUIRED" });
  });

  it("BATCH_OK still sends a child's completion to review", () => {
    expect(applyAction("complete", child("IN_PROGRESS", { reviewPolicy: "BATCH_OK" }))).toEqual({
      ok: true,
      status: "PENDING_REVIEW",
      releaseRewards: false,
    });
  });

  it.each<[ChoreStatus, ReviewPolicy, boolean]>([
    ["PENDING_REVIEW", "BATCH_OK", true],
    ["PENDING_REVIEW", "AUTO_APPROVE", true],
    ["PENDING_REVIEW", "REVIEW_EACH", false],
    ["NEW", "BATCH_OK", false],
    ["APPROVED", "BATCH_OK", false],
  ])("canBatchApprove(%s, %s) = %s", (status, policy, expected) => {
    expect(canBatchApprove(status, policy)).toBe(expected);
  });
});

describe("permissions", () => {
  it.each<ChoreAction>(["approve", "requestRework", "reject", "cancel"])(
    "a child cannot %s",
    (action) => {
      const from: ChoreStatus = action === "cancel" ? "NEW" : "PENDING_REVIEW";
      expect(applyAction(action, child(from))).toMatchObject({ ok: false, code: "FORBIDDEN" });
    },
  );

  it("a child cannot touch a sibling's chore", () => {
    expect(applyAction("start", child("NEW", { actorIsAssignee: false }))).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
  });

  it("a parent can act on any member's chore", () => {
    expect(applyAction("start", parent("NEW"))).toMatchObject({ ok: true, status: "IN_PROGRESS" });
  });

  it("uses readable wording in messages", () => {
    const result = applyAction("requestRework", child("PENDING_REVIEW"));
    expect(result).toMatchObject({ message: "Only a parent can request rework on a chore." });
  });
});

describe("photo proof", () => {
  it("blocks a child's completion until a photo is attached", () => {
    const ctx = child("IN_PROGRESS", { requiresPhoto: true });
    expect(applyAction("complete", ctx)).toMatchObject({ ok: false, code: "PHOTO_REQUIRED" });
    expect(applyAction("complete", { ...ctx, hasPhoto: true })).toMatchObject({
      ok: true,
      status: "PENDING_REVIEW",
    });
  });

  it("does not require a photo from a parent", () => {
    expect(applyAction("complete", parent("IN_PROGRESS", { requiresPhoto: true }))).toMatchObject({
      ok: true,
      status: "APPROVED",
    });
  });
});

describe("availableActions", () => {
  it("lists what a child can do", () => {
    expect(availableActions(child("NEW"))).toEqual(["start", "defer", "complete"]);
    expect(availableActions(child("IN_PROGRESS"))).toEqual(["reset", "complete"]);
    expect(availableActions(child("PENDING_REVIEW"))).toEqual([]);
    expect(availableActions(child("NEEDS_REWORK"))).toEqual(["start", "complete"]);
  });

  it("still offers complete when only the photo is missing", () => {
    expect(availableActions(child("IN_PROGRESS", { requiresPhoto: true }))).toContain("complete");
  });

  it("lists parent review actions", () => {
    expect(availableActions(parent("PENDING_REVIEW"))).toEqual([
      "approve",
      "requestRework",
      "reject",
      "cancel",
    ]);
    expect(availableActions(parent("APPROVED"))).toEqual([]);
  });
});
