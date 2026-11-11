/**
 * Push on phones: ask permission, get this phone's Expo push token, and
 * register it with the API (or unregister it). The web version
 * (push.web.ts) does nothing: Expo push is for iOS and Android.
 *
 * Getting a token needs the app's Expo project id (`eas init` adds it to the
 * app config). Without one, push is skipped and everything else (the inbox,
 * the digest in the inbox, settings) still works.
 */
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { Api } from "../../api/endpoints";
import { kv } from "../../lib/kv";

const TOKEN_KEY = "titan.push.token";

// Show notifications that arrive while the app is open, too.
Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
});

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/** Registers this phone for push. Returns false when push isn't possible here. */
export async function registerForPush(api: Api): Promise<boolean> {
  if (!Device.isDevice) return false; // simulators can't receive push
  const id = projectId();
  if (!id) return false; // needs `eas init`; see docs/mvp-plan.md (Step 10)
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Titan Household",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return false;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  await api.registerDevice({
    expoPushToken: token,
    platform: Platform.OS === "ios" ? "ios" : "android",
  });
  await kv.set(TOKEN_KEY, token);
  return true;
}

/** Stops push to this phone (signing out, or switching to a shared family device). */
export async function unregisterPush(api: Api): Promise<void> {
  const token = await kv.get(TOKEN_KEY);
  if (!token) return;
  try {
    await api.unregisterDevice(token);
  } finally {
    await kv.remove(TOKEN_KEY);
  }
}

/** Calls `onOpen` with a tapped notification's data. Returns an unsubscribe function. */
export function onNotificationTap(onOpen: (data: Record<string, unknown>) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    onOpen((response.notification.request.content.data ?? {}) as Record<string, unknown>);
  });
  return () => sub.remove();
}
