/**
 * The chore instance state machine. Callers (API, jobs, Alexa) describe an
 * action and its context; this module decides whether it is allowed and what
 * the instance becomes. It never mutates anything.
 *
 *   action         from                               to              who
 *   start          NEW, DEFERRED, NEEDS_REWORK        IN_PROGRESS     assignee or parent
 *   defer          NEW                                DEFERRED        assignee or parent
 *   reset          IN_PROGRESS, DEFERRED              NEW             assignee or parent
 *   complete       NEW, IN_PROGRESS, NEEDS_REWORK     PENDING_REVIEW  assignee or parent
 *   approve        PENDING_REVIEW                     APPROVED        parent  (rewards released)
 *   requestRework  PENDING_REVIEW                     NEEDS_REWORK    parent  (priority → HIGH)
 *   reject         PENDING_REVIEW                     REJECTED        parent  (reward forfeited)
 *   cancel         any non-terminal                   CANCELED        parent
 *   claim          NEW, on the job board              NEW             anyone in the job's pool
 *   release        NEW, IN_PROGRESS, DEFERRED         NEW             the claimer or a parent
 *
 * Job board: an OPEN job has no assignee until someone claims it. While it's
 * on the board, the only possible actions are claim and cancel. Releasing a
 * claimed job puts it back on the board for someone else.
 *
 * "complete" can skip review and go straight to APPROVED when:
 *   - a parent does it (design doc: "if a parent says a chore is complete,
 *     no verification is needed"), or
 *   - the chore's review policy is AUTO_APPROVE (low-stakes chores, so parents
 *     don't drown in reviews).
 * Completing straight from NEW allows a one-tap "done", including by voice.
 *
 * Photo proof: when the chore requires a photo, a CHILD can only complete
 * after attaching one, even under AUTO_APPROVE. A parent is trusted without proof.
 *
 * REJECTED vs CANCELED: both are final, but they mean different things.
 * Cancel withdraws the chore itself ("we're not doing this one"). Reject
 * declines submitted work (e.g. a fake photo) and forfeits the reward; it
 * stays in the family history.
 */
import type { ChoreStatus, Priority, Role } from "./status.js";
import { isTerminalStatus } from "./status.js";

export const CHORE_ACTIONS = [
  "start",
  "defer",
  "reset",
  "complete",
  "approve",
  "requestRework",
  "reject",
  "cancel",
  "claim",
  "release",
] as const;
export type ChoreAction = (typeof CHORE_ACTIONS)[number];

/** A parent's decision on a submission (the verification spec's names), and the action it maps to. */
export const REVIEW_DECISIONS = ["APPROVE", "REQUEST_REWORK", "REJECT"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];
export const REVIEW_DECISION_ACTION: Record<ReviewDecision, ChoreAction> = {
  APPROVE: "approve",
  REQUEST_REWORK: "requestRework",
  REJECT: "reject",
};

/** Actions taken directly on an instance (completion and review have their own endpoints). */
export const DIRECT_ACTIONS = ["start", "defer", "reset", "cancel", "claim", "release"] as const;
export type DirectAction = (typeof DIRECT_ACTIONS)[number];

/**
 * How a chore's completions are reviewed, set per chore by a parent:
 *   REVIEW_EACH  — every submission is reviewed individually (paid or high-stakes chores)
 *   BATCH_OK     — reviewed, but may be approved in bulk ("Approve all low-stakes")
 *   AUTO_APPROVE — no review; completing approves immediately
 */
export const REVIEW_POLICIES = ["REVIEW_EACH", "BATCH_OK", "AUTO_APPROVE"] as const;
export type ReviewPolicy = (typeof REVIEW_POLICIES)[number];

/**
 * Where an occurrence stands with the job board:
 *   NONE    — an ordinary assigned chore
 *   OPEN    — on the board, waiting for someone to claim it
 *   CLAIMED — taken from the board (can be given back)
 */
export const BOARD_STATES = ["NONE", "OPEN", "CLAIMED"] as const;
export type BoardState = (typeof BOARD_STATES)[number];

export interface TransitionContext {
  status: ChoreStatus;
  actorRole: Role;
  /** Whether the actor is one of the instance's assignees. */
  actorIsAssignee: boolean;
  requiresPhoto: boolean;
  hasPhoto: boolean;
  reviewPolicy: ReviewPolicy;
  /** Default "NONE". */
  board?: BoardState;
  /** Whether the actor may claim this job (in its pool; an empty pool means everyone). */
  actorInPool?: boolean;
}

export type TransitionErrorCode =
  | "TERMINAL" // instance is APPROVED, REJECTED, or CANCELED
  | "INVALID_TRANSITION" // action not possible from the current status
  | "FORBIDDEN" // actor lacks permission
  | "PHOTO_REQUIRED";

export type TransitionResult =
  | {
      ok: true;
      status: ChoreStatus;
      /** Set when the transition forces a priority (e.g. rework → HIGH). */
      priority?: Priority;
      /** True when the instance just reached APPROVED: credit its rewards (money/points, XP). */
      releaseRewards: boolean;
      /**
       * Set by claim ("CLAIMED": the actor becomes the only assignee) and
       * release ("OPEN": assignees are removed).
       */
      board?: BoardState;
    }
  | { ok: false; code: TransitionErrorCode; message: string };

type Who = "ASSIGNEE_OR_PARENT" | "PARENT" | "POOL";

interface Rule {
  from: ReadonlySet<ChoreStatus> | "ANY_NON_TERMINAL";
  to: ChoreStatus;
  who: Who;
}

const RULES: Record<ChoreAction, Rule> = {
  start: {
    from: new Set(["NEW", "DEFERRED", "NEEDS_REWORK"]),
    to: "IN_PROGRESS",
    who: "ASSIGNEE_OR_PARENT",
  },
  defer: { from: new Set(["NEW"]), to: "DEFERRED", who: "ASSIGNEE_OR_PARENT" },
  reset: { from: new Set(["IN_PROGRESS", "DEFERRED"]), to: "NEW", who: "ASSIGNEE_OR_PARENT" },
  complete: {
    from: new Set(["NEW", "IN_PROGRESS", "NEEDS_REWORK"]),
    to: "PENDING_REVIEW",
    who: "ASSIGNEE_OR_PARENT",
  },
  approve: { from: new Set(["PENDING_REVIEW"]), to: "APPROVED", who: "PARENT" },
  requestRework: { from: new Set(["PENDING_REVIEW"]), to: "NEEDS_REWORK", who: "PARENT" },
  reject: { from: new Set(["PENDING_REVIEW"]), to: "REJECTED", who: "PARENT" },
  cancel: { from: "ANY_NON_TERMINAL", to: "CANCELED", who: "PARENT" },
  claim: { from: new Set(["NEW"]), to: "NEW", who: "POOL" },
  release: {
    from: new Set(["NEW", "IN_PROGRESS", "DEFERRED"]),
    to: "NEW",
    who: "ASSIGNEE_OR_PARENT",
  },
};

/** Human wording for error messages. */
const ACTION_LABELS: Record<ChoreAction, string> = {
  start: "start",
  defer: "defer",
  reset: "reset",
  complete: "complete",
  approve: "approve",
  requestRework: "request rework on",
  reject: "reject",
  cancel: "cancel",
  claim: "claim",
  release: "give back",
};

function fail(code: TransitionErrorCode, message: string): TransitionResult {
  return { ok: false, code, message };
}

/** Decides the outcome of `action` in `ctx`. Pure: the caller persists the result. */
export function applyAction(action: ChoreAction, ctx: TransitionContext): TransitionResult {
  const rule = RULES[action];
  const label = ACTION_LABELS[action];
  const isParent = ctx.actorRole === "PARENT";

  if (isTerminalStatus(ctx.status)) {
    return fail("TERMINAL", `This chore is already ${ctx.status} and can't be changed.`);
  }
  if (rule.from !== "ANY_NON_TERMINAL" && !rule.from.has(ctx.status)) {
    return fail("INVALID_TRANSITION", `Can't ${label} a chore that is ${ctx.status}.`);
  }

  // Job board rules come first: what's possible depends on where the job stands.
  const board = ctx.board ?? "NONE";
  if (action === "claim") {
    if (board !== "OPEN") {
      return fail("INVALID_TRANSITION", "This chore isn't on the job board.");
    }
    if (!ctx.actorInPool) return fail("FORBIDDEN", "This job isn't open to you.");
    return { ok: true, status: "NEW", releaseRewards: false, board: "CLAIMED" };
  }
  if (board === "OPEN" && action !== "cancel") {
    return fail("INVALID_TRANSITION", "Claim this job from the job board first.");
  }
  if (action === "release" && board !== "CLAIMED") {
    return fail("INVALID_TRANSITION", "Only a job taken from the job board can be given back.");
  }

  const permitted = rule.who === "PARENT" ? isParent : isParent || ctx.actorIsAssignee;
  if (!permitted) {
    return fail(
      "FORBIDDEN",
      rule.who === "PARENT"
        ? `Only a parent can ${label} a chore.`
        : `Only the assignee or a parent can ${label} this chore.`,
    );
  }
  if (action === "release") {
    return { ok: true, status: "NEW", releaseRewards: false, board: "OPEN" };
  }

  if (action === "complete") {
    if (isParent) {
      // A parent's word is final: skip review and release rewards now.
      return { ok: true, status: "APPROVED", releaseRewards: true };
    }
    if (ctx.requiresPhoto && !ctx.hasPhoto) {
      return fail("PHOTO_REQUIRED", "Add a photo before marking this chore complete.");
    }
    if (ctx.reviewPolicy === "AUTO_APPROVE") {
      return { ok: true, status: "APPROVED", releaseRewards: true };
    }
  }
  if (action === "requestRework") {
    return { ok: true, status: rule.to, priority: "HIGH", releaseRewards: false };
  }
  return { ok: true, status: rule.to, releaseRewards: rule.to === "APPROVED" };
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

/**
 * Whether a pending submission may be approved by "Approve all low-stakes".
 * REVIEW_EACH chores always need an individual look. (AUTO_APPROVE chores
 * never reach PENDING_REVIEW from a child, but a policy change can leave one
 * waiting, and batch-approving it is clearly fine.)
 */
export function canBatchApprove(status: ChoreStatus, reviewPolicy: ReviewPolicy): boolean {
  return status === "PENDING_REVIEW" && reviewPolicy !== "REVIEW_EACH";
}
