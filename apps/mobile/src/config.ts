import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Where the API lives. EXPO_PUBLIC_API_URL overrides it (e.g. a deployed API).
 * In development on a phone, the API is assumed to run on the same computer
 * as the Expo dev server, so its LAN address is reused.
 */
export function apiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (Platform.OS === "web") return "http://localhost:3000";
  const devHost = Constants.expoConfig?.hostUri?.split(":")[0];
  return `http://${devHost ?? "localhost"}:3000`;
}

/** On a shared device, go back to "Who's using this?" after this much inactivity. */
export const SHARED_DEVICE_IDLE_MS = 2 * 60_000;
