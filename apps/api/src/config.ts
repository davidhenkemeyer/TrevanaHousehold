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
  // Behind a hosting proxy (Fly, Railway, Render): trust X-Forwarded-For so rate
  // limits and logs see the real client. "true", "false", or a hop count.
  TRUST_PROXY: z.string().default("false"),
  // The web sign-in cookie is Secure (https only) unless this is "false".
  // Defaults to true in production and false in development (http://localhost).
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  // Optional: Expo's push security token, if "enhanced push security" is on for the project.
  EXPO_ACCESS_TOKEN: z.string().optional(),
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
  expoAccessToken?: string;
  /** Fastify's trustProxy: false, true, or the number of proxy hops. */
  trustProxy: boolean | number;
  /** Whether the web refresh-token cookie is marked Secure. */
  cookieSecure: boolean;
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

/** Development defaults that must never reach production. */
const DEV_JWT_SECRET = "dev-only-secret-change-me-0123456789abcdef";
const DEV_S3_SECRET = "chores-dev-secret";

/** Settings that are fine in development but unsafe or broken in production. */
function productionProblems(e: z.infer<typeof envSchema>, corsOrigins: string[]): string[] {
  const problems: string[] = [];
  if (e.JWT_SECRET === DEV_JWT_SECRET) {
    problems.push("  JWT_SECRET: set a real secret in production (not the example value)");
  }
  if (e.S3_SECRET_KEY === DEV_S3_SECRET) {
    problems.push("  S3_SECRET_KEY: set a real key in production");
  }
  if (corsOrigins.length === 0) {
    problems.push("  CORS_ORIGINS: list the web app's origin (e.g. https://app.example.com)");
  }
  if (corsOrigins.some((o) => o === "*" || !o.startsWith("https://"))) {
    problems.push("  CORS_ORIGINS: every origin must be an explicit https:// address");
  }
  if (!e.S3_PUBLIC_URL) {
    problems.push("  S3_PUBLIC_URL: set the https address apps use to reach photo storage");
  } else if (!e.S3_PUBLIC_URL.startsWith("https://")) {
    problems.push("  S3_PUBLIC_URL: must be https in production");
  }
  return problems;
}

function parseTrustProxy(value: string): boolean | number {
  if (value === "true") return true;
  const hops = Number(value);
  return Number.isInteger(hops) && hops > 0 ? hops : false;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${problems.join("\n")}`);
  }
  const e = parsed.data;
  const production = e.NODE_ENV === "production";
  const corsOrigins = e.CORS_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (production) {
    const problems = productionProblems(e, corsOrigins);
    if (problems.length > 0) {
      throw new Error(`Invalid environment configuration:\n${problems.join("\n")}`);
    }
  }
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
    trustProxy: parseTrustProxy(e.TRUST_PROXY),
    cookieSecure: e.COOKIE_SECURE ? e.COOKIE_SECURE === "true" : production,
    photoRetentionDays: 90,
    ...(e.EXPO_ACCESS_TOKEN && { expoAccessToken: e.EXPO_ACCESS_TOKEN }),
  };
}
