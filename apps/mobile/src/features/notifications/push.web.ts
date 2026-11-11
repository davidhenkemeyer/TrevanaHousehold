/**
 * Web: no push (Expo push is for iOS and Android). Notifications are in the
 * app's inbox. Same interface as push.ts.
 */
import type { Api } from "../../api/endpoints";

export function registerForPush(_api: Api): Promise<boolean> {
  return Promise.resolve(false);
}

export function unregisterPush(_api: Api): Promise<void> {
  return Promise.resolve();
}

export function onNotificationTap(_onOpen: (data: Record<string, unknown>) => void): () => void {
  return () => undefined;
}
