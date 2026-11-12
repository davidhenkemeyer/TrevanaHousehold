/**
 * Subscriptions, behind an interface so the API stays testable: the real one
 * asks RevenueCat (revenuecat.ts), tests use an in-memory fake
 * (test/fakeBilling.ts). The RevenueCat customer id is always the family id.
 */
export type BillingStoreName = "APP_STORE" | "PLAY_STORE" | "WEB" | "PROMOTIONAL" | "OTHER";

/** A family's Pro entitlement as RevenueCat reports it. */
export interface ProEntitlement {
  /** End of the paid period; far in the future for a lifetime grant. */
  expiresAt: Date;
  productId: string | null;
  store: BillingStoreName | null;
  /** False once they've cancelled or a payment failed. */
  willRenew: boolean;
}

export interface Billing {
  /** Whether a RevenueCat key is set. Without one, every family is just "never bought". */
  readonly configured: boolean;
  /**
   * The current (or most recent) Pro entitlement of a customer, or null if
   * they never had one. Throws when RevenueCat can't be reached.
   */
  proEntitlement(customerId: string): Promise<ProEntitlement | null>;
}
