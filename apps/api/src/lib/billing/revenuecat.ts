/**
 * RevenueCat's REST API (v1): reads a customer's "pro" entitlement. Used by
 * the webhook and the post-purchase refresh; the webhook's own body is never
 * trusted, only this lookup.
 */
import type { Billing, BillingStoreName, ProEntitlement } from "./types.js";

const API = "https://api.revenuecat.com/v1";
export const PRO_ENTITLEMENT = "pro";
/** A lifetime or never-expiring grant. */
const FOREVER = new Date("9999-12-31T00:00:00.000Z");

interface SubscriberResponse {
  subscriber?: {
    entitlements?: Record<
      string,
      { expires_date: string | null; product_identifier?: string } | undefined
    >;
    subscriptions?: Record<
      string,
      | {
          store?: string;
          unsubscribe_detected_at?: string | null;
          billing_issues_detected_at?: string | null;
        }
      | undefined
    >;
  };
}

export function storeName(store: string | undefined): BillingStoreName | null {
  switch (store) {
    case undefined:
      return null;
    case "app_store":
    case "mac_app_store":
      return "APP_STORE";
    case "play_store":
      return "PLAY_STORE";
    case "stripe":
    case "rc_billing":
      return "WEB";
    case "promotional":
      return "PROMOTIONAL";
    default:
      return "OTHER";
  }
}

/** Reads the "pro" entitlement out of a v1 subscriber response. Exported for tests. */
export function parseEntitlement(body: SubscriberResponse): ProEntitlement | null {
  const entitlement = body.subscriber?.entitlements?.[PRO_ENTITLEMENT];
  if (!entitlement) return null;
  const productId = entitlement.product_identifier ?? null;
  const sub = productId ? body.subscriber?.subscriptions?.[productId] : undefined;
  const expiresAt = entitlement.expires_date ? new Date(entitlement.expires_date) : FOREVER;
  return {
    expiresAt,
    productId,
    store: storeName(sub?.store ?? (entitlement.expires_date ? undefined : "promotional")),
    willRenew:
      entitlement.expires_date !== null &&
      !sub?.unsubscribe_detected_at &&
      !sub?.billing_issues_detected_at,
  };
}

export function createRevenueCatBilling(secretKey: string | undefined): Billing {
  if (!secretKey) {
    return { configured: false, proEntitlement: () => Promise.resolve(null) };
  }
  return {
    configured: true,
    async proEntitlement(customerId) {
      const res = await fetch(`${API}/subscribers/${encodeURIComponent(customerId)}`, {
        headers: { authorization: `Bearer ${secretKey}`, accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`RevenueCat lookup failed: HTTP ${res.status}`);
      return parseEntitlement((await res.json()) as SubscriberResponse);
    },
  };
}
