/**
 * Small persistent key-value storage for iOS and Android, kept in the OS
 * keychain/keystore (encrypted, per app). See kv.ts for the web version.
 */
import * as SecureStore from "expo-secure-store";

export const kv = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
};
