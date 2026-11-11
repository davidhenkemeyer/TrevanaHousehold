/**
 * Builds the Fastify app from explicit dependencies. The server (server.ts)
 * and the tests both call this, so tests exercise the real app.
 */
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import {
  type ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import type { Db } from "./db.js";
import type { Deps } from "./deps.js";
import { registerErrorHandling } from "./errors.js";
import { createAccessTokenService } from "./lib/accessTokens.js";
import { createExpoPush } from "./lib/push/expo.js";
import type { PushSender } from "./lib/push/types.js";
import { createS3Storage } from "./lib/storage/s3.js";
import type { PhotoStorage } from "./lib/storage/types.js";
import { uploadRoutes } from "./modules/uploads/routes.js";
import { authRoutes, meRoutes } from "./modules/auth/routes.js";
import { choreRoutes } from "./modules/chores/routes.js";
import { instanceRoutes } from "./modules/instances/routes.js";
import { pairingPublicRoutes, pairingRoutes } from "./modules/pairing/routes.js";
import { reviewRoutes } from "./modules/reviews/routes.js";
import { notificationRoutes } from "./modules/notifications/routes.js";
import { progressRoutes } from "./modules/progress/routes.js";
import { rewardRoutes } from "./modules/rewards/routes.js";
import { familyRoutes } from "./modules/families/routes.js";
import { inviteRoutes } from "./modules/invites/routes.js";

export interface BuildAppOptions {
  config: AppConfig;
  db: Db;
  now?: () => Date;
  /** Default: S3-compatible storage from config.storage. Tests pass an in-memory fake. */
  storage?: PhotoStorage;
  /** Default: Expo push. Tests pass an in-memory fake. */
  push?: PushSender;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config, db } = options;
  const deps: Deps = {
    config,
    db,
    accessTokens: createAccessTokenService(config.jwtSecret, config.accessTokenTtlSeconds),
    storage: options.storage ?? createS3Storage(config.storage),
    push: options.push ?? createExpoPush(config.expoAccessToken),
    now: options.now ?? (() => new Date()),
  };

  const app = Fastify({
    // Behind a hosting proxy, request.ip is the real client (rate limits, logs).
    // A hop count trusts that many proxies, nearest first.
    trustProxy:
      typeof config.trustProxy === "number"
        ? (
            (hops: number) => (_address: string, hop: number) =>
              hop < hops
          )(config.trustProxy)
        : config.trustProxy,
    logger: {
      level: config.logLevel,
      // Never write credentials to logs.
      redact: ["req.headers.authorization", "req.headers.cookie"],
    },
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorateRequest("userId", "");
  registerErrorHandling(app);

  // List methods explicitly: @fastify/cors allows only GET, HEAD, and POST by
  // default, which would block the web app's PATCH and DELETE requests.
  await app.register(cors, {
    origin: config.corsOrigins,
    methods: ["GET", "HEAD", "POST", "PATCH", "DELETE"],
    // The web app's refresh token is an httpOnly cookie (plugins/webSession.ts).
    // Safe because origins are an explicit list, never "*".
    credentials: true,
  });
  await app.register(cookie);
  if (config.rateLimitEnabled) {
    // global: false → only routes that set `config.rateLimit` are limited.
    // When the plugin isn't registered, those per-route settings are simply ignored.
    await app.register(rateLimit, { global: false, max: 100, timeWindow: "1 minute" });
  }

  // Liveness: the process is up and serving. No database, so a brief database
  // outage doesn't make the host restart a healthy machine.
  app.get(
    "/health/live",
    { schema: { response: { 200: z.object({ status: z.literal("ok") }) } } },
    async () => ({ status: "ok" as const }),
  );

  // Readiness: also checks the database.
  app.get(
    "/health",
    { schema: { response: { 200: z.object({ status: z.literal("ok") }) } } },
    async () => {
      await db.$queryRaw`SELECT 1`;
      return { status: "ok" as const };
    },
  );

  await app.register(
    async (v1) => {
      await v1.register(authRoutes, { deps });
      await v1.register(meRoutes, { deps });
      await v1.register(familyRoutes, { deps });
      await v1.register(inviteRoutes, { deps });
      await v1.register(pairingRoutes, { deps });
      await v1.register(pairingPublicRoutes, { deps });
      await v1.register(choreRoutes, { deps });
      await v1.register(instanceRoutes, { deps });
      await v1.register(reviewRoutes, { deps });
      await v1.register(uploadRoutes, { deps });
      await v1.register(rewardRoutes, { deps });
      await v1.register(progressRoutes, { deps });
      await v1.register(notificationRoutes, { deps });
    },
    { prefix: "/v1" },
  );

  return app;
}
