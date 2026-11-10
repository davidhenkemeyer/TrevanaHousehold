/**
 * The chore instance state machine. Callers (API, jobs, Alexa) describe an
 * action and its context; this module decides whether it is allowed and what
 * the instance becomes. It never mutates anything.
 *
 *   action    from                              to            who
 *   start     NEW, DEFERRED, NOT_APPROVED       IN_PROGRESS   assignee or parent
 *   defer     NEW                               DEFERRED      assignee or parent
 *   reset     IN_PROGRESS, DEFERRED             NEW           assignee or parent
 *   complete  NEW, IN_PROGRESS, NOT_APPROVED    COMPLETED     assignee or parent
 *             (from NEW: one-tap "done" for quick chores and voice assistants;
 *              a parent completing goes straight to VERIFIED: no review needed)
 *   verify    COMPLETED                         VERIFIED      parent
 *   reject    COMPLETED                         NOT_APPROVED  parent  (priority → HIGH)
 *   cancel    any non-terminal                  CANCELED      parent
 *
 * Photo proof: when the chore requires a photo, a CHILD can only complete
 * after attaching one. A parent is trusted without proof.
 */
import type { ChoreStatus, Priority, Role } from "./status.js";
import { isTerminalStatus } from "./status.js";

export const CHORE_ACTIONS = [
  "start",
  "defer",
  "reset",
  "complete",
  "verify",
  "reject",
  "cancel",
] as const;
export type ChoreAction = (typeof CHORE_ACTIONS)[number];

export interface TransitionContext {
  status: ChoreStatus;
  actorRole: Role;
  /** Whether the actor is one of the instance's assignees. */
  actorIsAssignee: boolean;
  requiresPhoto: boolean;
  hasPhoto: boolean;
}

export type TransitionErrorCode =
  | "TERMINAL" // instance is VERIFIED or CANCELED
  | "INVALID_TRANSITION" // action not possible from the current status
  | "FORBIDDEN" // actor lacks permission
  | "PHOTO_REQUIRED";

export type TransitionResult =
  | {
      ok: true;
      status: ChoreStatus;
      /** Set when the transition forces a priority (e.g. rejection → HIGH). */
      priority?: Priority;
      /** True when the instance just reached VERIFIED and points should be awarded. */
      awardPoints: boolean;
    }
  | { ok: false; code: TransitionErrorCode; message: string };

type Who = "ASSIGNEE_OR_PARENT" | "PARENT";

interface Rule {
  from: ReadonlySet<ChoreStatus> | "ANY_NON_TERMINAL";
  to: ChoreStatus;
  who: Who;
}

const RULES: Record<ChoreAction, Rule> = {
  start: {
    from: new Set(["NEW", "DEFERRED", "NOT_APPROVED"]),
    to: "IN_PROGRESS",
    who: "ASSIGNEE_OR_PARENT",
  },
  defer: { from: new Set(["NEW"]), to: "DEFERRED", who: "ASSIGNEE_OR_PARENT" },
  reset: { from: new Set(["IN_PROGRESS", "DEFERRED"]), to: "NEW", who: "ASSIGNEE_OR_PARENT" },
  complete: {
    from: new Set(["NEW", "IN_PROGRESS", "NOT_APPROVED"]),
    to: "COMPLETED",
    who: "ASSIGNEE_OR_PARENT",
  },
  verify: { from: new Set(["COMPLETED"]), to: "VERIFIED", who: "PARENT" },
  reject: { from: new Set(["COMPLETED"]), to: "NOT_APPROVED", who: "PARENT" },
  cancel: { from: "ANY_NON_TERMINAL", to: "CANCELED", who: "PARENT" },
};

function fail(code: TransitionErrorCode, message: string): TransitionResult {
  return { ok: false, code, message };
}

/** Decides the outcome of `action` in `ctx`. Pure: the caller persists the result. */
export function applyAction(action: ChoreAction, ctx: TransitionContext): TransitionResult {
  const rule = RULES[action];
  const isParent = ctx.actorRole === "PARENT";

  if (isTerminalStatus(ctx.status)) {
    return fail("TERMINAL", `This chore is already ${ctx.status} and can't be changed.`);
  }
  if (rule.from !== "ANY_NON_TERMINAL" && !rule.from.has(ctx.status)) {
    return fail("INVALID_TRANSITION", `Can't ${action} a chore that is ${ctx.status}.`);
  }
  const permitted = rule.who === "PARENT" ? isParent : isParent || ctx.actorIsAssignee;
  if (!permitted) {
    return fail(
      "FORBIDDEN",
      rule.who === "PARENT"
        ? `Only a parent can ${action} a chore.`
        : `Only the assignee or a parent can ${action} this chore.`,
    );
  }

  if (action === "complete") {
    if (isParent) {
      // A parent's word is final: skip review and award points now.
      return { ok: true, status: "VERIFIED", awardPoints: true };
    }
    if (ctx.requiresPhoto && !ctx.hasPhoto) {
      return fail("PHOTO_REQUIRED", "Add a photo before marking this chore complete.");
    }
  }
  if (action === "reject") {
    return { ok: true, status: rule.to, priority: "HIGH", awardPoints: false };
  }
  return { ok: true, status: rule.to, awardPoints: rule.to === "VERIFIED" };
}

/**
 * Actions the actor could take right now, for showing buttons in the app or
 * telling a voice assistant what's possible. "complete" is listed even when a
 * photo is still missing, since the UI should offer it and then prompt for the photo.
 */
export function availableActions(ctx: TransitionContext): ChoreAction[] {
  return CHORE_ACTIONS.filter((action) => {
    const result = applyAction(action, ctx);
    return result.ok || result.code === "PHOTO_REQUIRED";
  });
}
