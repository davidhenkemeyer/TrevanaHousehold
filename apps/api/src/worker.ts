/**
 * Standalone background worker: runs the scheduled jobs without serving HTTP.
 * Use it when jobs should run separately from the API (set RUN_JOBS=false on
 * the API processes). For a single small deployment, the API runs jobs itself.
 */
import pino from "pino";
import { loadConfig } from "./config.js";
import { createDb } from "./db.js";
import { startJobs } from "./jobs/index.js";

const config = loadConfig();
const log = pino({ level: config.logLevel });
const db = createDb(config.databaseUrl);
const jobs = await startJobs({ config, db, now: () => new Date() }, log);

const shutdown = async (signal: string) => {
  log.info({ signal }, "Worker shutting down");
  await jobs.stop();
  await db.$disconnect();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
