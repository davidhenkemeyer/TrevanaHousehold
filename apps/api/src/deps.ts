/**
 * Everything a service needs, passed explicitly so tests can swap any piece
 * (a test database, a controllable clock).
 */
import type { AppConfig } from "./config.js";
import type { Db } from "./db.js";
import type { AccessTokenService } from "./lib/accessTokens.js";

export interface Deps {
  config: AppConfig;
  db: Db;
  accessTokens: AccessTokenService;
  /** The current time. Never call `new Date()` in services; use this. */
  now: () => Date;
}
