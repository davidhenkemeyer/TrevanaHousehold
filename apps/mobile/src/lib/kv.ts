/**
 * Small persistent key-value storage, web version (localStorage).
 * Phones use kv.native.ts (the OS keychain/keystore via expo-secure-store);
 * Metro picks the right file per platform.
 *
 * Note: localStorage is readable by any script on the page. Fine for the MVP;
 * the web app should move tokens to httpOnly cookies before public launch.
 */
export const kv = {
  async get(key: string): Promise<string | null> {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    globalThis.localStorage?.setItem(key, value);
  },
  async remove(key: string): Promise<void> {
    globalThis.localStorage?.removeItem(key);
  },
};
