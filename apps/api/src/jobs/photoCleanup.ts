/**
 * Photo cleanup, daily:
 *
 *  1. Proof photos are deleted `photoRetentionDays` (90) after the submission
 *     was reviewed. The submission keeps its history; `photosDeletedAt` makes
 *     the app show "Photo expired".
 *  2. Uploads that were never attached are deleted a day after they were made.
 *  3. Reference photos that were replaced or removed are deleted.
 *
 * Storage is deleted before the database rows, so a failure part-way just
 * means the next run tries again (deleting a missing object is harmless).
 */
import type { FastifyBaseLogger } from "fastify";
import type { AppConfig } from "../config.js";
import type { Deps } from "../deps.js";
import { UNUSED_UPLOAD_TTL_MS } from "../modules/uploads/service.js";

const BATCH_SIZE = 200;
const DAY_MS = 24 * 60 * 60_000;

export interface CleanupResult {
  expiredSubmissions: number;
  unusedUploads: number;
  replacedReferences: number;
}

export async function cleanUpPhotos(
  deps: Pick<Deps, "db" | "storage" | "now"> & { config: Pick<AppConfig, "photoRetentionDays"> },
  log: Pick<FastifyBaseLogger, "info">,
): Promise<CleanupResult> {
  const now = deps.now();
  const result: CleanupResult = { expiredSubmissions: 0, unusedUploads: 0, replacedReferences: 0 };

  // 1. Proof photos past retention (counted from the first review).
  const reviewedBefore = new Date(now.getTime() - deps.config.photoRetentionDays * DAY_MS);
  for (;;) {
    const batch = await deps.db.submission.findMany({
      where: {
        photoKeys: { isEmpty: false },
        reviews: { some: { createdAt: { lt: reviewedBefore } } },
      },
      select: { id: true, photoKeys: true },
      take: BATCH_SIZE,
    });
    if (batch.length === 0) break;
    const keys = batch.flatMap((s) => s.photoKeys);
    await deps.storage.delete(keys);
    await deps.db.$transaction([
      deps.db.submission.updateMany({
        where: { id: { in: batch.map((s) => s.id) } },
        data: { photoKeys: [], photosDeletedAt: now },
      }),
      deps.db.upload.deleteMany({ where: { key: { in: keys } } }),
    ]);
    result.expiredSubmissions += batch.length;
  }

  // 2. Uploads never attached to anything.
  const unusedBefore = new Date(now.getTime() - UNUSED_UPLOAD_TTL_MS);
  for (;;) {
    const batch = await deps.db.upload.findMany({
      where: { usedAt: null, createdAt: { lt: unusedBefore } },
      select: { id: true, key: true },
      take: BATCH_SIZE,
    });
    if (batch.length === 0) break;
    await deps.storage.delete(batch.map((u) => u.key));
    await deps.db.upload.deleteMany({ where: { id: { in: batch.map((u) => u.id) } } });
    result.unusedUploads += batch.length;
  }

  // 3. Reference photos no chore points to any more.
  let afterId: string | undefined;
  for (;;) {
    const batch = await deps.db.upload.findMany({
      where: {
        purpose: "REFERENCE",
        usedAt: { not: null },
        ...(afterId !== undefined && { id: { gt: afterId } }),
      },
      select: { id: true, key: true },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
    });
    if (batch.length === 0) break;
    afterId = batch.at(-1)?.id;
    const inUse = await deps.db.chore.findMany({
      where: { referencePhotoKey: { in: batch.map((u) => u.key) } },
      select: { referencePhotoKey: true },
    });
    const keep = new Set(inUse.map((c) => c.referencePhotoKey));
    const orphans = batch.filter((u) => !keep.has(u.key));
    if (orphans.length === 0) continue;
    await deps.storage.delete(orphans.map((u) => u.key));
    await deps.db.upload.deleteMany({ where: { id: { in: orphans.map((u) => u.id) } } });
    result.replacedReferences += orphans.length;
  }

  if (result.expiredSubmissions + result.unusedUploads + result.replacedReferences > 0) {
    log.info(result, "Cleaned up photos");
  }
  return result;
}
