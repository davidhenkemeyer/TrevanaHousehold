/**
 * Expo app configuration.
 *
 * Before the first store build (see docs/deploy.md):
 *   - BUNDLE_ID: the business's reverse domain. It can't change after the
 *     first store release. Still a placeholder.
 *   - EAS project id: `npx eas init` prints it; put it in EAS_PROJECT_ID
 *     below (or the EAS_PROJECT_ID env var). Push notifications need it.
 * The API address for builds comes from EXPO_PUBLIC_API_URL (set per build
 * profile in eas.json, and for the web build on the static host).
 */
import type { ExpoConfig } from "expo/config";

// Assumes the domain gettenara.com: confirm before the first store build (it can't change after).
const BUNDLE_ID = "com.gettenara.family";
const EAS_PROJECT_ID: string | undefined = process.env.EAS_PROJECT_ID || undefined;
/** Shared with the iPhone widget (targets/widget) for its snapshot. */
const APP_GROUP = `group.${BUNDLE_ID}`;
/** Apple Developer team id; the widget extension needs it to be signed. */
const APPLE_TEAM_ID: string | undefined = process.env.APPLE_TEAM_ID || undefined;

const config: ExpoConfig = {
  // The name under the icon: short, because iPhones cut off "Tenara Family".
  name: "Tenara",
  slug: "tenara-family",
  scheme: "tenarafamily",
  version: "0.1.0",
  // Store build numbers are managed by EAS (eas.json: appVersionSource "remote").
  runtimeVersion: { policy: "appVersion" },
  orientation: "portrait",
  userInterfaceStyle: "light",
  // Generated from assets/brand by `pnpm --filter @tenara/mobile icons`.
  icon: "./assets/generated/icon.png",
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: true, // family iPads are a primary shared device
    // Only standard HTTPS encryption: skips TestFlight's export-compliance question.
    config: { usesNonExemptEncryption: false },
    entitlements: { "com.apple.security.application-groups": [APP_GROUP] },
    ...(APPLE_TEAM_ID && { appleTeamId: APPLE_TEAM_ID }),
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
  ...(EAS_PROJECT_ID && { extra: { eas: { projectId: EAS_PROJECT_ID } } }),
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    ["expo-notifications", { color: "#059669" }],
    [
      "expo-image-picker",
      {
        photosPermission: "Tenara Family uses your photos to show that a chore is done.",
        cameraPermission: "Tenara Family uses the camera to take a photo of a finished chore.",
        microphonePermission: false,
      },
    ],
    [
      "expo-splash-screen",
      { image: "./assets/generated/splash-icon.png", imageWidth: 160, backgroundColor: "#F1F5F9" },
    ],
    // Home-screen widgets (Pro). iPhone: the SwiftUI target in targets/widget.
    "@bacons/apple-targets",
    // Android: drawn from JS (src/features/widgets/TodayWidget.tsx).
    [
      "react-native-android-widget",
      {
        widgets: [
          {
            name: "Today",
            label: "Today's chores",
            description: "What's left today, at a glance.",
            minWidth: "180dp",
            minHeight: "110dp",
            targetCellWidth: 3,
            targetCellHeight: 2,
            resizeMode: "horizontal|vertical",
            // Android's minimum; the app also redraws it whenever Today loads.
            updatePeriodMillis: 1_800_000,
          },
        ],
      },
    ],
  ],
};

export default config;
