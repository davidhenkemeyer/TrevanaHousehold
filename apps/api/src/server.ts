/**
 * Process entry point: load config, connect, start background jobs (unless
 * RUN_JOBS=false), listen, and shut down cleanly.
 */
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db.js";
import { type RunningJobs, startJobs } from "./jobs/index.js";

const config = loadConfig();
const db = createDb(config.databaseUrl);
const app = await buildApp({ config, db });
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
  if (config.runJobs) {
    jobs = await startJobs({ config, db, now: () => new Date() }, app.log);
  }
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.fatal({ err: error }, "Failed to start");
  await jobs?.stop();
  await db.$disconnect();
  process.exit(1);
}
