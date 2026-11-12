/**
 * The iPhone home-screen widget (WidgetKit). Built by @bacons/apple-targets on
 * `expo prebuild` / EAS builds; there is no ios/ folder in the repo.
 * It shares the app's App Group, where the app writes the "today" snapshot
 * (src/features/widgets/publish.ios.ts).
 */
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "widget",
  name: "TenaraWidget",
  displayName: "Tenara",
  deploymentTarget: "17.0",
  colors: {
    $accent: "#059669",
    $widgetBackground: "#FFFFFF",
  },
  entitlements: {
    "com.apple.security.application-groups":
      config.ios.entitlements["com.apple.security.application-groups"],
  },
});
