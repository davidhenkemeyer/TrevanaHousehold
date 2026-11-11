/**
 * Small persistent key-value storage, web version (localStorage).
 * Phones use kv.native.ts (the OS keychain/keystore via expo-secure-store);
 * Metro picks the right file per platform.
 *
 * Note: localStorage is readable by any script on the page, so no tokens are
 * kept here (the refresh token is an httpOnly cookie; see auth/session.ts).
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
