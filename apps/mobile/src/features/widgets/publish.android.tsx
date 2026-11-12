/**
 * Android: keeps the snapshot in the app's storage (the widget task reads it
 * when Android asks for a redraw, e.g. every 30 minutes or after a reboot)
 * and redraws any widgets on the home screen now.
 *
 * The widget library is loaded lazily: in Expo Go its native module doesn't
 * exist and importing it throws, so there the widget is simply skipped.
 */
import { kv } from "../../lib/kv";
import type * as AndroidWidgetLib from "react-native-android-widget";
import type { WidgetSnapshot } from "./snapshot";
import type * as TodayWidgetModule from "./TodayWidget";

export const WIDGET_KV_KEY = "tenara.widget";

export function publishWidget(snapshot: WidgetSnapshot): void {
  void kv.set(WIDGET_KV_KEY, JSON.stringify(snapshot)).catch(() => undefined);
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { requestWidgetUpdate } =
      require("react-native-android-widget") as typeof AndroidWidgetLib;
    const { ANDROID_WIDGET_NAME, TodayWidget } =
      require("./TodayWidget") as typeof TodayWidgetModule;
    /* eslint-enable @typescript-eslint/no-require-imports */
    void requestWidgetUpdate({
      widgetName: ANDROID_WIDGET_NAME,
      renderWidget: () => <TodayWidget snapshot={snapshot} />,
    }).catch(() => undefined);
  } catch {
    // No widget support in this build (Expo Go).
  }
}
