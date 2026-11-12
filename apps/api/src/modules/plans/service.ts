/**
 * A family's plan (Basic or Pro) and the checks that enforce it.
 *
 * The rules live in packages/domain/src/plans.ts. This module loads what the
 * database knows (the trial end and the subscription mirrored from
 * RevenueCat), turns it into an EffectivePlan, and throws PRO_REQUIRED where
 * a Basic family reaches for a Pro feature. Nothing else checks plans.
 */
import type { Plan } from "@tenara/contracts";
import {
  type EffectivePlan,
  PLAN_LIMITS,
  type ProFeature,
  type Role,
  allows,
  canAddMember,
  effectivePlan,
  featureMap,
} from "@tenara/domain";
import type { Deps } from "../../deps.js";
import { AppError } from "../../errors.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { notify, parentsOf } from "../notifications/service.js";

/** Parents hear this long before the trial ends. */
const TRIAL_REMINDER_MS = 3 * 24 * 60 * 60_000;

/**
 * Tells the parents, once, that the trial ends soon, unless they've already
 * subscribed. Called by the hourly planning job for every family.
 */
export async function remindTrialEnding(
  tx: Prisma.TransactionClient,
  familyId: string,
  now: Date,
): Promise<boolean> {
  const family = await tx.family.findUniqueOrThrow({ where: { id: familyId }, select: planSelect });
  const plan = planOf(family, now);
  const end = family.trialEndsAt;
  if (plan.reason !== "TRIAL" || end === null) return false;
  if (end.getTime() - now.getTime() > TRIAL_REMINDER_MS) return false;
  const sent = await tx.notification.count({ where: { familyId, type: "TRIAL_ENDING" } });
  if (sent > 0) return false;
  const daysLeft = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60_000)));
  await notify(tx, now, {
    familyId,
    to: await parentsOf(tx, familyId),
    type: "TRIAL_ENDING",
    details: { daysLeft },
  });
  return true;
}

type DbOrTx = Deps["db"] | Prisma.TransactionClient;

/** Select (or include) this on a Family to compute its plan. */
export const planSelect = {
  trialEndsAt: true,
  subscription: { select: { expiresAt: true, willRenew: true, store: true } },
} as const satisfies Prisma.FamilySelect;

export interface PlanRow {
  trialEndsAt: Date | null;
  subscription: {
    expiresAt: Date | null;
    willRenew: boolean;
    store: Plan["store"];
  } | null;
}

export function planOf(row: PlanRow, now: Date): EffectivePlan {
  return effectivePlan(
    { trialEndsAt: row.trialEndsAt, proExpiresAt: row.subscription?.expiresAt ?? null },
    now,
  );
}

export async function loadPlan(db: DbOrTx, familyId: string, now: Date): Promise<EffectivePlan> {
  const row = await db.family.findUniqueOrThrow({ where: { id: familyId }, select: planSelect });
  return planOf(row, now);
}

/** The plan as the app sees it. */
export function toPlanDto(row: PlanRow, now: Date): Plan {
  const plan = planOf(row, now);
  const sub = row.subscription;
  return {
    tier: plan.tier,
    reason: plan.reason,
    endsAt: plan.endsAt?.toISOString() ?? null,
    trialUsed: plan.trialUsed,
    willRenew: plan.reason === "SUBSCRIPTION" && (sub?.willRenew ?? false),
    store: plan.reason === "SUBSCRIPTION" ? (sub?.store ?? null) : null,
    features: featureMap(plan),
    limits: PLAN_LIMITS[plan.tier],
  };
}

const FEATURE_NAMES: Record<ProFeature, string> = {
  extraMembers: "More than 2 parents or 3 kids",
  photos: "Photo proof",
  money: "Real-money allowance",
  catalog: "The rewards catalog",
  jobBoard: "The job board",
  familyGoal: "The family goal",
  widgets: "Home-screen widgets",
  fullHistory: "Full history",
};

export function proRequired(feature: ProFeature): AppError {
  return new AppError(403, "PRO_REQUIRED", `${FEATURE_NAMES[feature]} is part of Tenara Pro.`, {
    feature,
  });
}

/** Throws PRO_REQUIRED unless the family has this feature now. */
export async function requirePro(
  db: DbOrTx,
  familyId: string,
  now: Date,
  feature: ProFeature,
): Promise<void> {
  if (!allows(await loadPlan(db, familyId, now), feature)) throw proRequired(feature);
}

/** Throws PRO_REQUIRED when one more member with this role doesn't fit the plan. */
export async function requireRoomFor(
  db: DbOrTx,
  familyId: string,
  now: Date,
  role: Role,
): Promise<void> {
  const plan = await loadPlan(db, familyId, now);
  const parents = await db.membership.count({ where: { familyId, active: true, role: "PARENT" } });
  const kids = await db.membership.count({ where: { familyId, active: true, role: "CHILD" } });
  if (!canAddMember(plan, role, { parents, kids })) {
    const limits = PLAN_LIMITS.BASIC;
    throw new AppError(
      403,
      "PRO_REQUIRED",
      `Basic includes up to ${limits.maxParents} parents and ${limits.maxKids} kids. Tenara Pro has room for more.`,
      { feature: "extraMembers" satisfies ProFeature },
    );
  }
}
