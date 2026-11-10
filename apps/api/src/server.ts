/**
 * Process entry point: load config, connect, start background jobs (unless
 * RUN_JOBS=false), listen, and shut down cleanly.
 */
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db.js";
import { type RunningJobs, startJobs } from "./jobs/index.js";
import { createS3Storage } from "./lib/storage/s3.js";

const config = loadConfig();
const db = createDb(config.databaseUrl);
const storage = createS3Storage(config.storage);
const app = await buildApp({ config, db, storage });
let jobs: RunningJobs | undefined;

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  await jobs?.stop();
  await db.$disconnect();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  if (config.storage.createBucket) {
    // Development: make sure local storage has the bucket. A failure isn't fatal;
    // everything except photos works without storage.
    await storage
      .ensureBucket()
      .catch((err: unknown) =>
        app.log.warn({ err }, "Photo storage unavailable; run `pnpm db:up` for photos"),
      );
  }
  if (config.runJobs) {
    jobs = await startJobs({ config, db, storage, now: () => new Date() }, app.log);
  }
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.fatal({ err: error }, "Failed to start");
  await jobs?.stop();
  await db.$disconnect();
  process.exit(1);
}
