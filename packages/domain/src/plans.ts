/**
 * Basic vs Pro: what each plan includes, and which plan a family is on.
 *
 * Basic (free) is the whole core loop for a family of up to 2 parents and
 * 3 kids. Pro adds more members, photo proof, real money, the rewards catalog
 * and job board, the family goal, widgets, and full history. Every new family
 * gets a 14-day Pro trial.
 *
 * When Pro ends (trial over or subscription lapsed), nothing is deleted and
 * nobody is removed: Pro features pause. Chores keep running, photo-required
 * chores stop asking for photos, money stops accruing (balances stay and can
 * be paid out), and no new job-board occurrences are planned. Pro settings
 * can be turned off but not on.
 *
 * The API enforces all of this (`requirePro` in apps/api); the app only shows
 * the plan it's given. Prices aren't here: the stores set them per country.
 */
import type { Role } from "./status.js";

export const PLAN_TIERS = ["BASIC", "PRO"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const PRO_FEATURES = [
  /** More than 2 parents or 3 kids. */
  "extraMembers",
  /** Photo proof on chores and reference photos. */
  "photos",
  /** Real-money allowance (points stay free). */
  "money",
  /** The points rewards catalog. */
  "catalog",
  /** Optional paid jobs anyone can claim. */
  "jobBoard",
  /** The shared family goal. */
  "familyGoal",
  /** Home-screen widgets. */
  "widgets",
  /** History older than 30 days. */
  "fullHistory",
] as const;
export type ProFeature = (typeof PRO_FEATURES)[number];

export interface PlanLimits {
  /** Null means no limit. */
  maxParents: number | null;
  maxKids: number | null;
  /** How far back history goes; null means all of it. */
  historyDays: number | null;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  BASIC: { maxParents: 2, maxKids: 3, historyDays: 30 },
  PRO: { maxParents: null, maxKids: null, historyDays: null },
};

export const TRIAL_DAYS = 14;

/** What the API stores about a family's paid status. */
export interface PlanFacts {
  /** End of the free trial, set when the family is created. */
  trialEndsAt: Date | null;
  /** When the current paid period ends (from the store, via RevenueCat). */
  proExpiresAt: Date | null;
}

export interface EffectivePlan {
  tier: PlanTier;
  /** Why it's Pro, or null on Basic. */
  reason: "TRIAL" | "SUBSCRIPTION" | null;
  /** When Pro ends (the later of trial and subscription), or null on Basic. */
  endsAt: Date | null;
  /** True once a family's trial has run out (so the app stops offering it). */
  trialUsed: boolean;
}

export function effectivePlan(facts: PlanFacts, now: Date): EffectivePlan {
  const t = now.getTime();
  const paid = facts.proExpiresAt !== null && facts.proExpiresAt.getTime() > t;
  const trial = facts.trialEndsAt !== null && facts.trialEndsAt.getTime() > t;
  const trialUsed = facts.trialEndsAt !== null && !trial;
  if (paid) {
    const endsAt =
      trial && facts.trialEndsAt!.getTime() > facts.proExpiresAt!.getTime()
        ? facts.trialEndsAt
        : facts.proExpiresAt;
    return { tier: "PRO", reason: "SUBSCRIPTION", endsAt, trialUsed };
  }
  if (trial) return { tier: "PRO", reason: "TRIAL", endsAt: facts.trialEndsAt, trialUsed: false };
  return { tier: "BASIC", reason: null, endsAt: null, trialUsed };
}

export function trialEndsAtFor(createdAt: Date): Date {
  return new Date(createdAt.getTime() + TRIAL_DAYS * 24 * 60 * 60_000);
}

export function allows(plan: Pick<EffectivePlan, "tier">, _feature: ProFeature): boolean {
  // Every Pro feature is all-or-nothing today; the feature name documents the
  // call site and leaves room for features that move between plans later.
  return plan.tier === "PRO";
}

/** Every feature with whether this plan has it (for the app's locks). */
export function featureMap(plan: Pick<EffectivePlan, "tier">): Record<ProFeature, boolean> {
  return Object.fromEntries(PRO_FEATURES.map((f) => [f, allows(plan, f)])) as Record<
    ProFeature,
    boolean
  >;
}

/** Whether one more member with this role fits the plan. */
export function canAddMember(
  plan: Pick<EffectivePlan, "tier">,
  role: Role,
  current: { parents: number; kids: number },
): boolean {
  const limits = PLAN_LIMITS[plan.tier];
  const max = role === "PARENT" ? limits.maxParents : limits.maxKids;
  const count = role === "PARENT" ? current.parents : current.kids;
  return max === null || count < max;
}

// What keeps working, and how, once Pro has ended.

/** Photo proof is only asked for on Pro; the chore's setting is kept for later. */
export function photoRequired(
  chore: { requiresPhoto: boolean },
  plan: Pick<EffectivePlan, "tier">,
) {
  return chore.requiresPhoto && allows(plan, "photos");
}

/** Whether approved chores still earn real money. Points are free, so they always do. */
export function earnsCoins(
  currency: "MONEY" | "POINTS" | "NONE",
  plan: Pick<EffectivePlan, "tier">,
): boolean {
  if (currency === "NONE") return false;
  return currency === "POINTS" || allows(plan, "money");
}

/** Whether new job-board occurrences are planned. Existing ones stay claimable. */
export function boardOpen(plan: Pick<EffectivePlan, "tier">): boolean {
  return allows(plan, "jobBoard");
}

/** The earliest moment history goes back to, or null for all of it. */
export function historyStart(plan: Pick<EffectivePlan, "tier">, now: Date): Date | null {
  const days = PLAN_LIMITS[plan.tier].historyDays;
  return days === null ? null : new Date(now.getTime() - days * 24 * 60 * 60_000);
}
