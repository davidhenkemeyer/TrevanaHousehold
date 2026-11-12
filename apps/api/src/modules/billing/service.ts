/**
 * Keeping each family's Pro status in step with RevenueCat.
 *
 * The RevenueCat customer id is the family id. Two things trigger a sync:
 * RevenueCat's webhook (renewals, cancellations, expirations, refunds) and
 * the app, right after a purchase or "Restore purchases". Either way the API
 * asks RevenueCat for the customer's current entitlement and stores that;
 * the webhook's body only says *which* customers to look up.
 */
import { timingSafeEqual } from "node:crypto";
import type { Plan } from "@tenara/contracts";
import { idSchema } from "@tenara/contracts";
import type { Deps } from "../../deps.js";
import { AppError, unauthorized } from "../../errors.js";
import { requireParent } from "../access.js";
import { planSelect, toPlanDto } from "../plans/service.js";

/** Reads RevenueCat and stores the result. Unknown families are ignored. */
export async function syncSubscription(deps: Deps, familyId: string): Promise<boolean> {
  const family = await deps.db.family.findUnique({ where: { id: familyId }, select: { id: true } });
  if (!family) return false;
  const entitlement = await deps.billing.proEntitlement(familyId);
  const data = {
    store: entitlement?.store ?? null,
    productId: entitlement?.productId ?? null,
    expiresAt: entitlement?.expiresAt ?? null,
    willRenew: entitlement?.willRenew ?? false,
    checkedAt: deps.now(),
  };
  await deps.db.subscription.upsert({
    where: { familyId },
    create: { familyId, ...data },
    update: data,
  });
  return true;
}

function notConfigured(): AppError {
  return new AppError(503, "BILLING_NOT_CONFIGURED", "Purchases aren't set up on this server.");
}

/** After a purchase or restore: re-read the family's status and return its plan. */
export async function refreshPlan(deps: Deps, userId: string, familyId: string): Promise<Plan> {
  await requireParent(deps.db, familyId, userId);
  if (!deps.billing.configured) throw notConfigured();
  await syncSubscription(deps, familyId);
  const row = await deps.db.family.findUniqueOrThrow({
    where: { id: familyId },
    select: planSelect,
  });
  return toPlanDto(row, deps.now());
}

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface RevenueCatEvent {
  app_user_id?: string | undefined;
  original_app_user_id?: string | undefined;
  aliases?: string[] | undefined;
  /** TRANSFER events move purchases between customers. */
  transferred_from?: string[] | undefined;
  transferred_to?: string[] | undefined;
}

/** Every customer id an event mentions that could be a family. */
export function customerIds(event: RevenueCatEvent): string[] {
  const all = [
    event.app_user_id,
    event.original_app_user_id,
    ...(event.aliases ?? []),
    ...(event.transferred_from ?? []),
    ...(event.transferred_to ?? []),
  ];
  return [...new Set(all.filter((id): id is string => idSchema.safeParse(id).success))];
}

/** Handles one webhook delivery. Returns how many families were updated. */
export async function handleWebhook(
  deps: Deps,
  authorization: string | undefined,
  event: RevenueCatEvent,
): Promise<number> {
  const expected = deps.config.billing.webhookAuth;
  if (!expected || !deps.billing.configured) throw notConfigured();
  if (authorization === undefined || !sameSecret(authorization, expected)) {
    throw unauthorized("INVALID_WEBHOOK_AUTH", "Unknown webhook sender.");
  }
  let synced = 0;
  for (const id of customerIds(event)) {
    if (await syncSubscription(deps, id)) synced++;
  }
  return synced;
}
