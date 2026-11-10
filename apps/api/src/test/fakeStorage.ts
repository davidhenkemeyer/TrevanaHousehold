/**
 * In-memory PhotoStorage for tests: no storage server needed (locally or in CI).
 * `put` stands in for the app's direct upload to storage.
 */
import type { PhotoStorage, StoredObject } from "../lib/storage/types.js";
import { signingTime } from "../lib/storage/types.js";

export interface FakeStorage extends PhotoStorage {
  objects: Map<string, StoredObject>;
  /** What the app's upload would store. Defaults: 50 KB of the given type. */
  put(key: string, object?: Partial<StoredObject>): void;
  deleted: string[];
}

export const FAKE_UPLOAD_URL = "https://storage.test/titan-photos";

export function createFakeStorage(): FakeStorage {
  const objects = new Map<string, StoredObject>();
  const deleted: string[] = [];
  return {
    objects,
    deleted,
    put(key, object = {}) {
      objects.set(key, { size: 50_000, contentType: "image/jpeg", ...object });
    },
    createUploadForm({ key, contentType }) {
      return Promise.resolve({
        url: FAKE_UPLOAD_URL,
        fields: { key, "Content-Type": contentType, policy: "fake-policy" },
      });
    },
    head(key) {
      return Promise.resolve(objects.get(key) ?? null);
    },
    signedUrl(key, now) {
      return Promise.resolve(`${FAKE_UPLOAD_URL}/${key}?signed=${signingTime(now).toISOString()}`);
    },
    delete(keys) {
      for (const key of keys) {
        objects.delete(key);
        deleted.push(key);
      }
      return Promise.resolve();
    },
    ensureBucket() {
      return Promise.resolve();
    },
  };
}
