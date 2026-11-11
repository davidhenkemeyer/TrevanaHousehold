/**
 * Background jobs, scheduled with pg-boss (a job queue that lives in Postgres,
 * in its own `pgboss` schema, so there's no Redis to run).
 *
 * Every API process can run this safely: pg-boss stores schedules once, and
 * the "singleton" queue policy means only one run of each job is active at a
 * time, across all processes.
 *
 * The job logic itself lives in plain functions (planning.ts, lateness.ts, photoCleanup.ts)
 * that are tested directly and can be run by hand (`pnpm job:plan`).
 */
import type { FastifyBaseLogger } from "fastify";
import { PgBoss } from "pg-boss";
import type { AppConfig } from "../config.js";
import type { Deps } from "../deps.js";
import { expireOpenJobs, markLateInstances } from "./lateness.js";
import { cleanUpPhotos } from "./photoCleanup.js";
import { planAllFamilies } from "./planning.js";

export const JOBS = {
  /** Hourly at :05, UTC. Idempotent, so hourly covers every family's local midnight. */
  planFamilies: { name: "plan-families", cron: "5 * * * *" },
  /** Every 5 minutes. */
  markLate: { name: "mark-late", cron: "*/5 * * * *" },
  /** Daily at 09:15 UTC (the middle of the night in the Americas). */
  cleanUpPhotos: { name: "clean-up-photos", cron: "15 9 * * *" },
} as const;

export interface RunningJobs {
  boss: PgBoss;
  stop(): Promise<void>;
}

export async function startJobs(
  deps: Pick<Deps, "db" | "now" | "storage"> & {
    config: Pick<AppConfig, "databaseUrl" | "photoRetentionDays">;
  },
  log: FastifyBaseLogger,
  options: { schema?: string } = {},
): Promise<RunningJobs> {
  const boss = new PgBoss({
    connectionString: deps.config.databaseUrl,
    schema: options.schema ?? "pgboss",
  });
  boss.on("error", (error) => log.error({ err: error }, "Job queue error"));
  await boss.start();

  for (const job of Object.values(JOBS)) {
    await boss.createQueue(job.name, { policy: "singleton" });
    await boss.schedule(job.name, job.cron, null, { tz: "UTC" });
  }

  await boss.work(JOBS.planFamilies.name, async () => {
    await planAllFamilies(deps, log);
  });
  await boss.work(JOBS.markLate.name, async () => {
    await markLateInstances(deps, log);
    await expireOpenJobs(deps, log);
  });
  await boss.work(JOBS.cleanUpPhotos.name, async () => {
    await cleanUpPhotos(deps, log);
  });

  log.info({ jobs: Object.values(JOBS).map((j) => j.name) }, "Background jobs started");
  return {
    boss,
    // Graceful: let a running job finish (up to 30 s) before closing connections.
    stop: () => boss.stop({ graceful: true, timeout: 30_000 }),
  };
}
