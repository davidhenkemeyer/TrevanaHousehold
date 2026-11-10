/**
 * Runtime configuration, read once from environment variables and validated.
 * The server refuses to start with a missing or weak setting.
 */
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  // 0.0.0.0 so phones on the same Wi-Fi can reach a dev server (Expo Go).
  HOST: z.string().default("0.0.0.0"),
  CORS_ORIGINS: z.string().default(""),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  // Run scheduled jobs in this process. Set "false" when a separate worker (src/worker.ts) runs them.
  RUN_JOBS: z.enum(["true", "false"]).default("true"),
});

export interface AppConfig {
  databaseUrl: string;
  jwtSecret: string;
  port: number;
  host: string;
  corsOrigins: string[];
  logLevel: z.infer<typeof envSchema>["LOG_LEVEL"];
  /** Per-route rate limits on auth endpoints. Tests turn this off. */
  rateLimitEnabled: boolean;
  /** Whether server.ts starts the background jobs (see src/jobs). */
  runJobs: boolean;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  inviteTtlDays: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${problems.join("\n")}`);
  }
  const e = parsed.data;
  return {
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    port: e.PORT,
    host: e.HOST,
    corsOrigins: e.CORS_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    logLevel: e.LOG_LEVEL,
    rateLimitEnabled: true,
    runJobs: e.RUN_JOBS === "true",
    accessTokenTtlSeconds: 15 * 60,
    // Long, because kids stay signed in on family tablets. Rotation limits the damage of a leak.
    refreshTokenTtlDays: 60,
    inviteTtlDays: 7,
  };
}
