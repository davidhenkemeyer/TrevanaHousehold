/**
 * iPhone: writes the snapshot to the App Group the widget extension shares
 * (targets/widget reads the "today" key), then asks WidgetKit to redraw.
 * In Expo Go there's no extension; the library's calls quietly do nothing.
 */
import { ExtensionStorage } from "@bacons/apple-targets";
import type { WidgetSnapshot } from "./snapshot";

/** Must match app.config.ts (ios.entitlements) and the Swift widget. */
export const APP_GROUP = "group.com.gettenara.family";
const storage = new ExtensionStorage(APP_GROUP);

export function publishWidget(snapshot: WidgetSnapshot): void {
  try {
    storage.set("today", JSON.stringify(snapshot));
    ExtensionStorage.reloadWidget();
  } catch {
    // A widget that can't update shouldn't break the app.
  }
}
