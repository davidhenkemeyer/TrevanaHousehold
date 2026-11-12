/**
 * Android calls this (in the background, without opening the app) when a
 * widget is added, resized, or due for its periodic redraw. It draws the last
 * snapshot the app saved; it never calls the API.
 */
import type { WidgetTaskHandler } from "react-native-android-widget";
import { kv } from "../../lib/kv";
import { WIDGET_KV_KEY } from "./publish.android";
import { parseWidgetSnapshot } from "./snapshot";
import { TodayWidget } from "./TodayWidget";

export const widgetTaskHandler: WidgetTaskHandler = async ({ widgetAction, renderWidget }) => {
  if (widgetAction === "WIDGET_DELETED" || widgetAction === "WIDGET_CLICK") return;
  const snapshot = parseWidgetSnapshot(await kv.get(WIDGET_KV_KEY).catch(() => null));
  renderWidget(<TodayWidget snapshot={snapshot} />);
};
