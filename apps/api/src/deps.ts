/**
 * Everything a service needs, passed explicitly so tests can swap any piece
 * (a test database, a controllable clock, in-memory photo storage).
 */
import type { AppConfig } from "./config.js";
import type { Db } from "./db.js";
import type { AccessTokenService } from "./lib/accessTokens.js";
import type { Billing } from "./lib/billing/types.js";
import type { PushSender } from "./lib/push/types.js";
import type { PhotoStorage } from "./lib/storage/types.js";

export interface Deps {
  config: AppConfig;
  db: Db;
  accessTokens: AccessTokenService;
  storage: PhotoStorage;
  /** Push delivery; used only by background jobs. */
  push: PushSender;
  /** Subscription status (RevenueCat). */
  billing: Billing;
  /** The current time. Never call `new Date()` in services; use this. */
  now: () => Date;
}
