/**
 * Runs one job immediately, without the scheduler. For local development and
 * operations: `pnpm --filter @titan/api job:plan`, `job:mark-late`, or `job:cleanup-photos`.
 */
import pino from "pino";
import { loadConfig } from "../config.js";
import { createDb } from "../db.js";
import { createExpoPush } from "../lib/push/expo.js";
import { createS3Storage } from "../lib/storage/s3.js";
import { checkPushReceipts, sendDigests, sendInstantNotifications } from "./notifications.js";
import { expireOpenJobs, markLateInstances } from "./lateness.js";
import { cleanUpPhotos } from "./photoCleanup.js";
import { planAllFamilies } from "./planning.js";

const job = process.argv[2];
const config = loadConfig();
const log = pino({ level: config.logLevel });
const db = createDb(config.databaseUrl);
const deps = {
  config,
  db,
  storage: createS3Storage(config.storage),
  push: createExpoPush(config.expoAccessToken),
  now: () => new Date(),
};

try {
  if (job === "storage-setup") {
    // One-time production bucket setup (CORS for the web app, photo lifecycle).
    const expireProofsAfterDays = config.photoRetentionDays + 30;
    await deps.storage.configureBucket({
      corsOrigins: config.storage.corsOrigins,
      expireProofsAfterDays,
    });
    console.log({
      bucket: config.storage.bucket,
      corsOrigins: config.storage.corsOrigins,
      expireProofsAfterDays,
    });
  } else if (job === "plan") {
    console.log(await planAllFamilies(deps, log));
  } else if (job === "mark-late") {
    console.log({
      marked: await markLateInstances(deps, log),
      expiredJobs: await expireOpenJobs(deps, log),
    });
  } else if (job === "cleanup-photos") {
    console.log(await cleanUpPhotos(deps, log));
  } else if (job === "send-instant") {
    console.log({ sent: await sendInstantNotifications(deps, log) });
  } else if (job === "send-digests") {
    console.log({ digests: await sendDigests(deps, log) });
  } else if (job === "check-push-receipts") {
    console.log(await checkPushReceipts(deps, log));
  } else {
    console.error(
      "Usage: run-once.ts <plan | mark-late | cleanup-photos | send-instant | send-digests | check-push-receipts | storage-setup>",
    );
    process.exitCode = 1;
  }
} finally {
  await db.$disconnect();
}
