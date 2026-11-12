/**
 * App entry: Expo Router, plus (Android only) the background task that draws
 * the home-screen widget.
 */
import "expo-router/entry";
import { Platform } from "react-native";
import type * as AndroidWidgetLib from "react-native-android-widget";
import type * as WidgetTask from "./src/features/widgets/taskHandler";

if (Platform.OS === "android") {
  // Loaded lazily so iOS and the web never load the Android widget library,
  // and guarded because Expo Go has no widget module (importing it throws).
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { registerWidgetTaskHandler } =
      require("react-native-android-widget") as typeof AndroidWidgetLib;
    const { widgetTaskHandler } =
      require("./src/features/widgets/taskHandler") as typeof WidgetTask;
    /* eslint-enable @typescript-eslint/no-require-imports */
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch {
    // No widget support in this build.
  }
}
