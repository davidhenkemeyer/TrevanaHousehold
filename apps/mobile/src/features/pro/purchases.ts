/**
 * Buying Pro through RevenueCat: App Store and Google Play in the phone apps,
 * Stripe (RevenueCat Web Billing) on the web. The RevenueCat customer is the
 * family (appUserID = family id), so whichever parent buys, the family gets
 * Pro. After a purchase or restore, the app asks the API to confirm
 * (POST /billing/refresh); the API never takes the app's word for it.
 *
 * Keys are public SDK keys, per platform, from EXPO_PUBLIC_REVENUECAT_*.
 * Without one, purchases are "not set up in this build".
 */
import { Platform } from "react-native";
import Purchases, { type PurchasesPackage } from "react-native-purchases";

function sdkKey(): string | undefined {
  const key =
    Platform.OS === "ios"
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
      : Platform.OS === "android"
        ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
        : process.env.EXPO_PUBLIC_REVENUECAT_WEB_KEY;
  return key || undefined;
}

export const purchasesAvailable = (): boolean => sdkKey() !== undefined;

let configuredFor: string | null = null;

/** Sets up the SDK for this family (once), switching customers if the family changed. */
async function ready(familyId: string): Promise<void> {
  const apiKey = sdkKey();
  if (!apiKey) throw new Error("Purchases aren't set up in this build.");
  if (configuredFor === null) {
    Purchases.configure({ apiKey, appUserID: familyId });
  } else if (configuredFor !== familyId) {
    await Purchases.logIn(familyId);
  }
  configuredFor = familyId;
}

export interface ProPackages {
  monthly: PurchasesPackage | null;
  yearly: PurchasesPackage | null;
}

/** The current offering's monthly and yearly packages, with the store's prices. */
export async function loadPackages(familyId: string): Promise<ProPackages> {
  await ready(familyId);
  const offerings = await Purchases.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];
  return {
    monthly: packages.find((p) => p.packageType === Purchases.PACKAGE_TYPE.MONTHLY) ?? null,
    yearly: packages.find((p) => p.packageType === Purchases.PACKAGE_TYPE.ANNUAL) ?? null,
  };
}

/** Buys a package. Resolves false when the person closes the store sheet. */
export async function buy(familyId: string, pkg: PurchasesPackage): Promise<boolean> {
  await ready(familyId);
  try {
    await Purchases.purchasePackage(pkg);
    return true;
  } catch (error) {
    if ((error as { userCancelled?: boolean }).userCancelled) return false;
    throw error;
  }
}

/** "Restore purchases": ties earlier store purchases to this family. */
export async function restore(familyId: string): Promise<void> {
  await ready(familyId);
  await Purchases.restorePurchases();
}

/** Opens the store's subscription settings (phones), or RevenueCat's portal (web). */
export async function manage(familyId: string): Promise<void> {
  await ready(familyId);
  if (Platform.OS === "web") {
    const info = await Purchases.getCustomerInfo();
    if (info.managementURL && typeof window !== "undefined") window.open(info.managementURL);
    return;
  }
  await Purchases.showManageSubscriptions();
}
