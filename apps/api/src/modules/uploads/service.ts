/**
 * Photo uploads: hand out a signed upload form, and later check and claim
 * uploads when they're attached to a submission or a chore.
 *
 * Attaching happens in two steps so storage calls stay out of database
 * transactions: `checkUploads` (outside: rows, ownership, the stored file)
 * and `claimUploads` (inside: marks them used, once, even under a race).
 */
import { randomUUID } from "node:crypto";
import {
  type CreateUploadBody,
  type CreateUploadResponse,
  MAX_PHOTO_BYTES,
  type PHOTO_CONTENT_TYPES,
  type UploadPurpose,
} from "@tenara/contracts";
import type { Deps } from "../../deps.js";
import { badRequest, conflict, forbidden } from "../../errors.js";
import type { Membership } from "../../generated/prisma/client.js";
import type { DbOrTx } from "../instances/generate.js";
import { requireMember } from "../access.js";

/** How long the upload form works. */
export const UPLOAD_FORM_TTL_SECONDS = 10 * 60;
/** Unused uploads are deleted after this (see jobs/photoCleanup.ts). */
export const UNUSED_UPLOAD_TTL_MS = 24 * 60 * 60_000;

const EXTENSIONS: Record<(typeof PHOTO_CONTENT_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function createUpload(
  deps: Deps,
  userId: string,
  familyId: string,
  body: CreateUploadBody,
): Promise<CreateUploadResponse> {
  const member = await requireMember(deps.db, familyId, userId);
  if (body.purpose === "REFERENCE" && member.role !== "PARENT") {
    throw forbidden("PARENT_REQUIRED", "Only a parent can set a chore's reference photo.");
  }
  const now = deps.now();
  // Purpose first ("submission/...", "reference/..."), so a bucket lifecycle rule
  // can expire proof photos by prefix as a backstop (see storage:setup).
  const key = `${body.purpose.toLowerCase()}/families/${familyId}/${randomUUID()}.${EXTENSIONS[body.contentType]}`;
  const expiresAt = new Date(now.getTime() + UPLOAD_FORM_TTL_SECONDS * 1000);
  const form = await deps.storage.createUploadForm({
    key,
    contentType: body.contentType,
    maxBytes: MAX_PHOTO_BYTES,
    expiresInSeconds: UPLOAD_FORM_TTL_SECONDS,
  });
  const upload = await deps.db.upload.create({
    data: {
      familyId,
      createdById: member.id,
      purpose: body.purpose,
      key,
      contentType: body.contentType,
      createdAt: now,
      expiresAt,
    },
  });
  return {
    uploadId: upload.id,
    url: form.url,
    fields: form.fields,
    maxBytes: MAX_PHOTO_BYTES,
    expiresAt: expiresAt.toISOString(),
  };
}

export interface CheckedUpload {
  id: string;
  key: string;
}

/**
 * Verifies uploads before attaching them: they belong to this family and
 * this member, have the right purpose, haven't been used, and the file is
 * really in storage with an allowed type and size. Returns them in the
 * order given.
 */
export async function checkUploads(
  deps: Deps,
  input: {
    familyId: string;
    member: Membership;
    purpose: UploadPurpose;
    uploadIds: readonly string[];
  },
): Promise<CheckedUpload[]> {
  if (input.uploadIds.length === 0) return [];
  const rows = await deps.db.upload.findMany({
    where: { id: { in: [...input.uploadIds] }, familyId: input.familyId },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const checked: CheckedUpload[] = [];
  for (const id of input.uploadIds) {
    const row = byId.get(id);
    // Someone else's upload looks the same as a missing one.
    if (!row || row.createdById !== input.member.id) {
      throw badRequest("UPLOAD_NOT_FOUND", "That photo wasn't found. Try adding it again.");
    }
    if (row.purpose !== input.purpose) {
      throw badRequest("UPLOAD_WRONG_PURPOSE", "That photo was uploaded for something else.");
    }
    if (row.usedAt !== null) {
      throw conflict("UPLOAD_ALREADY_USED", "That photo is already attached to something.");
    }
    const stored = await deps.storage.head(row.key);
    if (!stored) {
      throw badRequest("UPLOAD_INCOMPLETE", "The photo didn't finish uploading. Try again.");
    }
    if (stored.size > MAX_PHOTO_BYTES || stored.contentType !== row.contentType) {
      throw badRequest("INVALID_PHOTO", "That photo can't be used. Try a different one.");
    }
    checked.push({ id: row.id, key: row.key });
  }
  return checked;
}

/** Marks checked uploads used. Fails if another request claimed one first. */
export async function claimUploads(
  tx: DbOrTx,
  uploads: readonly CheckedUpload[],
  now: Date,
): Promise<void> {
  if (uploads.length === 0) return;
  const { count } = await tx.upload.updateMany({
    where: { id: { in: uploads.map((u) => u.id) }, usedAt: null },
    data: { usedAt: now },
  });
  if (count !== uploads.length) {
    throw conflict("UPLOAD_ALREADY_USED", "That photo is already attached to something.");
  }
}
