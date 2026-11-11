import { Platform } from "react-native";
import { kv } from "../lib/kv";
import { type SessionStorage, type StoredSession, persistable } from "./session";

const SESSION_KEY = "titan.session";

export const sessionStorage: SessionStorage = {
  async load() {
    const raw = await kv.get(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  },
  // On the web, tokens are never written to storage (see persistable).
  save: (session) =>
    kv.set(SESSION_KEY, JSON.stringify(persistable(session, Platform.OS === "web"))),
  clear: () => kv.remove(SESSION_KEY),
};

export type DeviceMode = "personal" | "shared";
const DEVICE_MODE_KEY = "titan.deviceMode";

/**
 * Whether this device is someone's own phone ("personal": stays signed in) or
 * shared by the family ("shared": opens on "Who's using this?" and goes back
 * there after inactivity).
 */
export const deviceSettings = {
  async mode(): Promise<DeviceMode> {
    return (await kv.get(DEVICE_MODE_KEY)) === "shared" ? "shared" : "personal";
  },
  setMode: (mode: DeviceMode) => kv.set(DEVICE_MODE_KEY, mode),
};
