/**
 * Runtime configuration, read once from environment variables and validated.
 * The server refuses to start with a missing or weak setting.
 */
import { networkInterfaces } from "node:os";
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
  NODE_ENV: z.string().default("development"),
  // Photo storage (S3 or S3-compatible; RustFS from docker-compose locally).
  S3_ENDPOINT: z.url().default("http://localhost:9000"),
  // The address apps use for uploads and photos. Unset in development: this
  // computer's LAN address, so phones on the same Wi-Fi can reach local storage.
  S3_PUBLIC_URL: z.url().optional(),
  S3_BUCKET: z.string().min(3).default("titan-photos"),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY: z.string().default("chores"),
  S3_SECRET_KEY: z.string().default("chores-dev-secret"),
});

export interface StorageConfig {
  /** Where the API reaches storage. */
  endpoint: string;
  /** Where apps reach storage; signed URLs and upload forms use this host. */
  publicUrl: string;
  bucket: string;
  region: string;
  accessKey: string;
  secretKey: string;
  /** Create the bucket on startup if missing, and allow browser uploads (development only). */
  createBucket: boolean;
  /** Web origins allowed to upload and view photos from a browser (the bucket's CORS rule). */
  corsOrigins: string[];
}

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
  storage: StorageConfig;
  /** Proof photos are deleted this many days after the submission was reviewed. */
  photoRetentionDays: number;
}

/**
 * How likely an IPv4 address is to be the home Wi-Fi/LAN address a phone
 * can reach: 192.168.x first, then 10.x, then 172.16–31.x (often a virtual
 * machine adapter on Windows). 0 = don't use (e.g. VPN ranges like 100.64/10).
 */
export function lanRank(address: string): number {
  const [a = 0, b = 0] = address.split(".").map(Number);
  if (a === 192 && b === 168) return 3;
  if (a === 10) return 2;
  if (a === 172 && b >= 16 && b <= 31) return 1;
  return 0;
}

/**
 * Development default for S3_PUBLIC_URL: the storage endpoint with
 * "localhost" swapped for this computer's LAN address, when it has one.
 */
function lanStorageUrl(endpoint: string): string {
  const url = new URL(endpoint);
  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return endpoint;
  const [lan] = Object.values(networkInterfaces())
    .flat()
    .flatMap((i) => (i && i.family === "IPv4" && !i.internal ? [i.address] : []))
    .filter((address) => lanRank(address) > 0)
    .sort((x, y) => lanRank(y) - lanRank(x));
  if (lan === undefined) return endpoint;
  url.hostname = lan;
  return url.toString().replace(/\/$/, "");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${problems.join("\n")}`);
  }
  const e = parsed.data;
  const production = e.NODE_ENV === "production";
  if (production && e.S3_SECRET_KEY === "chores-dev-secret") {
    throw new Error(
      "Invalid environment configuration:\n  S3_SECRET_KEY: set a real key in production",
    );
  }
  const corsOrigins = e.CORS_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return {
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    port: e.PORT,
    host: e.HOST,
    corsOrigins,
    logLevel: e.LOG_LEVEL,
    rateLimitEnabled: true,
    runJobs: e.RUN_JOBS === "true",
    accessTokenTtlSeconds: 15 * 60,
    // Long, because kids stay signed in on family tablets. Rotation limits the damage of a leak.
    refreshTokenTtlDays: 60,
    inviteTtlDays: 7,
    storage: {
      endpoint: e.S3_ENDPOINT,
      publicUrl: e.S3_PUBLIC_URL ?? (production ? e.S3_ENDPOINT : lanStorageUrl(e.S3_ENDPOINT)),
      bucket: e.S3_BUCKET,
      region: e.S3_REGION,
      accessKey: e.S3_ACCESS_KEY,
      secretKey: e.S3_SECRET_KEY,
      createBucket: !production,
      corsOrigins,
    },
    photoRetentionDays: 90,
  };
}
