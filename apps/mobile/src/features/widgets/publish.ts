/**
 * Hands the widget snapshot to the home-screen widget. The web has no widgets,
 * so this version does nothing; publish.ios.ts and publish.android.tsx are
 * the real ones (Metro picks them by platform).
 */
import type { WidgetSnapshot } from "./snapshot";

export function publishWidget(_snapshot: WidgetSnapshot): void {
  // No widgets on the web.
}
