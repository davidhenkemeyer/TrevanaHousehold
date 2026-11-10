/**
 * Runs one job immediately, without the scheduler. For local development and
 * operations: `pnpm --filter @titan/api job:plan` or `job:mark-late`.
 */
import pino from "pino";
import { loadConfig } from "../config.js";
import { createDb } from "../db.js";
import { markLateInstances } from "./lateness.js";
import { planAllFamilies } from "./planning.js";

const job = process.argv[2];
const config = loadConfig();
const log = pino({ level: config.logLevel });
const db = createDb(config.databaseUrl);
const deps = { db, now: () => new Date() };

try {
  if (job === "plan") {
    console.log(await planAllFamilies(deps, log));
  } else if (job === "mark-late") {
    console.log({ marked: await markLateInstances(deps, log) });
  } else {
    console.error("Usage: run-once.ts <plan | mark-late>");
    process.exitCode = 1;
  }
} finally {
  await db.$disconnect();
}
