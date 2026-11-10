/**
 * Expo app configuration. The bundle ID is a placeholder until Step 11,
 * when it becomes the business's reverse domain (it can't change after the
 * first store release).
 */
import type { ExpoConfig } from "expo/config";

const BUNDLE_ID = "com.titansuite.household";

const config: ExpoConfig = {
  name: "Titan Household",
  slug: "titan-household",
  scheme: "titanhousehold",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  // Generated from assets/brand by `pnpm --filter @titan/mobile icons`.
  icon: "./assets/generated/icon.png",
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: true, // family iPads are a primary shared device
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      foregroundImage: "./assets/generated/adaptive-foreground.png",
      backgroundImage: "./assets/generated/adaptive-background.png",
      monochromeImage: "./assets/generated/adaptive-foreground.png",
    },
  },
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./assets/generated/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    [
      "expo-splash-screen",
      { image: "./assets/generated/splash-icon.png", imageWidth: 160, backgroundColor: "#F1F5F9" },
    ],
  ],
};

export default config;
