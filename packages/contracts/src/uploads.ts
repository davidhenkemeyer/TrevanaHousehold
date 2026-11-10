/**
 * Photo uploads. The app asks the API for an upload form, posts the file
 * straight to storage with it, then refers to the photo by `uploadId` when
 * submitting a chore or setting a chore's reference photo. Clients never send
 * storage keys or URLs, and only ever receive short-lived signed URLs to view
 * photos.
 */
import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.js";

export const PHOTO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type PhotoContentType = (typeof PHOTO_CONTENT_TYPES)[number];
/** Storage rejects anything larger. The app resizes photos well below this. */
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_SUBMISSION_PHOTOS = 3;

export const UPLOAD_PURPOSES = ["SUBMISSION", "REFERENCE"] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

export const createUploadBodySchema = z.strictObject({
  /** SUBMISSION: proof for a chore (any member). REFERENCE: a chore's reference photo (parents). */
  purpose: z.enum(UPLOAD_PURPOSES),
  contentType: z.enum(PHOTO_CONTENT_TYPES),
});
export type CreateUploadBody = z.infer<typeof createUploadBodySchema>;

export const createUploadResponseSchema = z.object({
  uploadId: idSchema,
  /** POST the file here as multipart form data: every field below, then `file` last. */
  url: z.string(),
  fields: z.record(z.string(), z.string()),
  maxBytes: z.int(),
  /** The form stops working after this. */
  expiresAt: isoDateTimeSchema,
});
export type CreateUploadResponse = z.infer<typeof createUploadResponseSchema>;

/** A photo to show. The URL is signed and works for a few minutes. */
export const photoSchema = z.object({ url: z.string() });
export type Photo = z.infer<typeof photoSchema>;

/** A list of upload ids with no repeats. */
export const uploadIdsSchema = (max: number) =>
  z
    .array(idSchema)
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length, "Photos must not repeat");
