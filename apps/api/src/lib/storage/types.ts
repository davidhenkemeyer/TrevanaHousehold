/**
 * Photo storage, behind an interface so services stay testable: the real one
 * talks to S3-compatible storage (s3.ts), tests use an in-memory fake (test/fakeStorage.ts).
 *
 * Rules (see claude.md): clients get upload forms and short-lived signed URLs,
 * never raw keys; the bucket itself is private.
 */
export interface UploadForm {
  /** Where the app POSTs the file. */
  url: string;
  /** Form fields to send before the file (they carry the signed policy). */
  fields: Record<string, string>;
}

export interface StoredObject {
  size: number;
  contentType: string | undefined;
}

export interface PhotoStorage {
  /** A signed form that accepts exactly one file at `key`, of `contentType`, up to `maxBytes`. */
  createUploadForm(input: {
    key: string;
    contentType: string;
    maxBytes: number;
    expiresInSeconds: number;
  }): Promise<UploadForm>;
  /** What's stored at `key`, or null if nothing is. */
  head(key: string): Promise<StoredObject | null>;
  /**
   * A signed URL to view the photo. Signing uses `now` rounded down to
   * SIGNED_URL_BUCKET_MS, so the URL stays the same for a while and the
   * app's image cache keeps working; it's valid for SIGNED_URL_TTL_SECONDS
   * from that rounded time.
   */
  signedUrl(key: string, now: Date): Promise<string>;
  /** Deletes the objects; missing ones are ignored. */
  delete(keys: readonly string[]): Promise<void>;
  /** Creates the bucket if missing and sets its CORS rule (development convenience). */
  ensureBucket(): Promise<void>;
  /**
   * Production setup, run once by `storage:setup`: the CORS rule for the web
   * app and a lifecycle rule expiring proof photos (a backstop for cleanup).
   */
  configureBucket(options: { corsOrigins: string[]; expireProofsAfterDays: number }): Promise<void>;
}

export const SIGNED_URL_BUCKET_MS = 10 * 60_000;
export const SIGNED_URL_TTL_SECONDS = 30 * 60;

export function signingTime(now: Date): Date {
  return new Date(Math.floor(now.getTime() / SIGNED_URL_BUCKET_MS) * SIGNED_URL_BUCKET_MS);
}
