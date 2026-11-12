/** In-memory Billing for tests: entitlements are set by the test, by family id. */
import type { Billing, ProEntitlement } from "../lib/billing/types.js";

export interface FakeBilling extends Billing {
  entitlements: Map<string, ProEntitlement>;
  /** Customer ids looked up, in order. */
  lookups: string[];
}

export function createFakeBilling(): FakeBilling {
  const entitlements = new Map<string, ProEntitlement>();
  const lookups: string[] = [];
  return {
    configured: true,
    entitlements,
    lookups,
    proEntitlement(customerId) {
      lookups.push(customerId);
      return Promise.resolve(entitlements.get(customerId) ?? null);
    },
  };
}
