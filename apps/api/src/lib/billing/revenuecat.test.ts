import { describe, expect, it } from "vitest";
import { parseEntitlement, storeName } from "./revenuecat.js";

describe("RevenueCat responses", () => {
  it("reads an active App Store subscription", () => {
    expect(
      parseEntitlement({
        subscriber: {
          entitlements: {
            pro: {
              expires_date: "2026-12-11T12:00:00Z",
              product_identifier: "tenara_pro_monthly",
            },
          },
          subscriptions: { tenara_pro_monthly: { store: "app_store" } },
        },
      }),
    ).toEqual({
      expiresAt: new Date("2026-12-11T12:00:00Z"),
      productId: "tenara_pro_monthly",
      store: "APP_STORE",
      willRenew: true,
    });
  });

  it("notices a cancellation and a billing problem", () => {
    const cancelled = parseEntitlement({
      subscriber: {
        entitlements: {
          pro: { expires_date: "2026-12-11T12:00:00Z", product_identifier: "tenara_pro_yearly" },
        },
        subscriptions: {
          tenara_pro_yearly: { store: "stripe", unsubscribe_detected_at: "2026-11-20T00:00:00Z" },
        },
      },
    });
    expect(cancelled).toMatchObject({ store: "WEB", willRenew: false });
  });

  it("treats a never-expiring grant as lifetime, and no entitlement as never bought", () => {
    expect(
      parseEntitlement({ subscriber: { entitlements: { pro: { expires_date: null } } } }),
    ).toMatchObject({ expiresAt: new Date("9999-12-31T00:00:00.000Z"), store: "PROMOTIONAL" });
    expect(parseEntitlement({ subscriber: { entitlements: {} } })).toBeNull();
    expect(parseEntitlement({})).toBeNull();
  });

  it("maps store names", () => {
    expect(storeName("play_store")).toBe("PLAY_STORE");
    expect(storeName("rc_billing")).toBe("WEB");
    expect(storeName("amazon")).toBe("OTHER");
  });
});
