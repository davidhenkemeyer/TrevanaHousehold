import { describe, expect, it } from "vitest";
import {
  type ChoreAction,
  type TransitionContext,
  applyAction,
  availableActions,
} from "./stateMachine.js";
import type { ChoreStatus } from "./status.js";

/** A child acting on their own chore, no photo requirement. */
function child(status: ChoreStatus, overrides: Partial<TransitionContext> = {}): TransitionContext {
  return {
    status,
    actorRole: "CHILD",
    actorIsAssignee: true,
    requiresPhoto: false,
    hasPhoto: false,
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
    ["IN_PROGRESS", "complete", "COMPLETED"],
    ["NOT_APPROVED", "start", "IN_PROGRESS"],
    ["NOT_APPROVED", "complete", "COMPLETED"],
    ["NEW", "complete", "COMPLETED"], // one-tap "done" without starting first
  ])("%s --%s--> %s", (from, action, to) => {
    expect(applyAction(action, child(from))).toEqual({ ok: true, status: to, awardPoints: false });
  });
});

describe("invalid transitions", () => {
  it.each<[ChoreStatus, ChoreAction]>([
    ["DEFERRED", "complete"], // must resume first
    ["NEW", "reset"],
    ["DEFERRED", "defer"],
    ["IN_PROGRESS", "start"],
    ["IN_PROGRESS", "defer"],
    ["COMPLETED", "start"],
    ["COMPLETED", "complete"],
  ])("%s cannot %s", (from, action) => {
    const result = applyAction(action, parent(from));
    expect(result).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
  });

  it.each<ChoreStatus>(["VERIFIED", "CANCELED"])("%s is terminal for every action", (status) => {
    for (const action of ["start", "complete", "cancel", "verify"] as const) {
      expect(applyAction(action, parent(status))).toMatchObject({ ok: false, code: "TERMINAL" });
    }
  });
});

describe("parent review", () => {
  it("verifying awards points", () => {
    expect(applyAction("verify", parent("COMPLETED"))).toEqual({
      ok: true,
      status: "VERIFIED",
      awardPoints: true,
    });
  });

  it("rejecting sends it back as NOT_APPROVED with HIGH priority", () => {
    expect(applyAction("reject", parent("COMPLETED"))).toEqual({
      ok: true,
      status: "NOT_APPROVED",
      priority: "HIGH",
      awardPoints: false,
    });
  });

  it("a parent completing a chore skips review", () => {
    expect(applyAction("complete", parent("IN_PROGRESS"))).toEqual({
      ok: true,
      status: "VERIFIED",
      awardPoints: true,
    });
  });

  it("a parent may cancel from any non-terminal status", () => {
    for (const status of ["NEW", "IN_PROGRESS", "DEFERRED", "COMPLETED", "NOT_APPROVED"] as const) {
      expect(applyAction("cancel", parent(status))).toMatchObject({ ok: true, status: "CANCELED" });
    }
  });
});

describe("permissions", () => {
  it.each<ChoreAction>(["verify", "reject", "cancel"])("a child cannot %s", (action) => {
    const from: ChoreStatus = action === "cancel" ? "NEW" : "COMPLETED";
    expect(applyAction(action, child(from))).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("a child cannot touch a sibling's chore", () => {
    expect(applyAction("start", child("NEW", { actorIsAssignee: false }))).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
  });

  it("a parent can act on any member's chore", () => {
    expect(applyAction("start", parent("NEW"))).toMatchObject({ ok: true, status: "IN_PROGRESS" });
  });
});

describe("photo proof", () => {
  it("blocks a child's completion until a photo is attached", () => {
    const ctx = child("IN_PROGRESS", { requiresPhoto: true });
    expect(applyAction("complete", ctx)).toMatchObject({ ok: false, code: "PHOTO_REQUIRED" });
    expect(applyAction("complete", { ...ctx, hasPhoto: true })).toMatchObject({
      ok: true,
      status: "COMPLETED",
    });
  });

  it("does not require a photo from a parent", () => {
    expect(applyAction("complete", parent("IN_PROGRESS", { requiresPhoto: true }))).toMatchObject({
      ok: true,
      status: "VERIFIED",
    });
  });
});

describe("availableActions", () => {
  it("lists what a child can do", () => {
    expect(availableActions(child("NEW"))).toEqual(["start", "defer", "complete"]);
    expect(availableActions(child("IN_PROGRESS"))).toEqual(["reset", "complete"]);
    expect(availableActions(child("COMPLETED"))).toEqual([]);
  });

  it("still offers complete when only the photo is missing", () => {
    expect(availableActions(child("IN_PROGRESS", { requiresPhoto: true }))).toContain("complete");
  });

  it("lists parent review actions", () => {
    expect(availableActions(parent("COMPLETED"))).toEqual(["verify", "reject", "cancel"]);
    expect(availableActions(parent("VERIFIED"))).toEqual([]);
  });
});
