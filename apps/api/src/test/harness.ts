/**
 * Test harness: a real app on the test database, a controllable clock, and
 * small helpers for common setup (sign up a parent, create a family, ...).
 *
 *   const t = useTestApp();          // in a describe block
 *   const mom = await t.signup();    // { user, tokens, headers }
 */
import type {
  AgendaResponse,
  Chore,
  CreateUploadResponse,
  FamilyDetail,
  Member,
} from "@titan/contracts";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { buildApp } from "../app.js";
import type { IssuedAuth, IssuedTokens } from "../modules/auth/sessions.js";
import { type AppConfig, loadConfig } from "../config.js";
import { type Db, createDb } from "../db.js";
import { type FakePush, createFakePush } from "./fakePush.js";
import { type FakeStorage, createFakeStorage } from "./fakeStorage.js";
import { testDatabaseUrl } from "./testDatabase.js";

/** The fixed starting instant for every test. */
export const T0 = new Date("2026-11-10T12:00:00.000Z");

export interface Session extends IssuedAuth {
  headers: { authorization: string };
}

export interface TestApp {
  app: FastifyInstance;
  db: Db;
  /** In-memory photo storage (reset before each test). */
  storage: FakeStorage;
  /** In-memory push sender: what jobs would have sent (reset before each test). */
  push: FakePush;
  /** Moves the app's clock forward. */
  advance(ms: number): void;
  request(
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    url: string,
    options?: { body?: unknown; session?: Session },
  ): Promise<LightMyRequestResponse>;
  signup(overrides?: { email?: string; displayName?: string; password?: string }): Promise<Session>;
  createFamily(parent: Session, name?: string): Promise<FamilyDetail>;
  addChild(
    parent: Session,
    familyId: string,
    body?: { displayName?: string; pin?: string },
  ): Promise<Member>;
  switchTo(caller: Session, familyId: string, membershipId: string, pin?: string): Promise<Session>;
  /** Trades a session's refresh token for a fresh one (as the app does when access expires). */
  refresh(session: Session): Promise<Session>;
  /** Creates a chore. Defaults: "Dishes", 10 min, daily from T0's date, due in 12 h, AUTO. */
  createChore(parent: Session, familyId: string, body?: Record<string, unknown>): Promise<Chore>;
  agenda(session: Session, familyId: string, query?: string): Promise<AgendaResponse>;
  /**
   * Requests an upload and "uploads" a file to fake storage, as the app does.
   * Returns the upload id. `stored: false` skips the file (an unfinished upload).
   */
  uploadPhoto(
    session: Session,
    familyId: string,
    options?: { purpose?: "SUBMISSION" | "REFERENCE"; stored?: boolean; size?: number },
  ): Promise<string>;
}

/** Default chore fields for tests (T0 is Tuesday 2026-11-10, 06:00 in Chicago). */
export const DEFAULT_CHORE = {
  name: "Dishes",
  effortMinutes: 10,
  recurrence: { freq: "DAILY", startDate: "2026-11-10" },
  deadlineMinutes: 12 * 60,
  assignMode: "AUTO",
} as const;

export const PASSWORD = "correct horse battery";
export const minutes = (n: number) => n * 60_000;
export const days = (n: number) => n * 86_400_000;

function asSession(auth: IssuedAuth): Session {
  return { ...auth, headers: { authorization: `Bearer ${auth.tokens.accessToken}` } };
}

function expectStatus(res: LightMyRequestResponse, status: number): void {
  if (res.statusCode !== status) {
    throw new Error(`Expected HTTP ${status}, got ${res.statusCode}: ${res.body}`);
  }
}

async function truncateAll(db: Db): Promise<void> {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/** Call inside a describe block. Each test starts with an empty database at time T0. */
export function useTestApp(): TestApp {
  let app: FastifyInstance;
  let db: Db;
  let now = T0;
  let emailCounter = 0;
  const storage = createFakeStorage();
  const push = createFakePush();

  beforeAll(async () => {
    const config: AppConfig = {
      ...loadConfig({
        DATABASE_URL: testDatabaseUrl(),
        JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
        LOG_LEVEL: "silent",
      }),
      rateLimitEnabled: false,
    };
    db = createDb(config.databaseUrl);
    app = await buildApp({ config, db, now: () => now, storage, push });
    await app.ready();
  });

  beforeEach(async () => {
    now = T0;
    storage.objects.clear();
    storage.deleted.length = 0;
    push.sent.length = 0;
    push.receiptsById.clear();
    push.receiptRequests.length = 0;
    push.dead.clear();
    await truncateAll(db);
  });

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
  });

  const t: TestApp = {
    get app() {
      return app;
    },
    get db() {
      return db;
    },
    storage,
    push,
    advance(ms) {
      now = new Date(now.getTime() + ms);
    },
    request(method, url, options = {}) {
      return app.inject({
        method,
        url,
        ...(options.body !== undefined && { payload: options.body as object }),
        ...(options.session && { headers: options.session.headers }),
      });
    },
    async signup(overrides = {}) {
      emailCounter++;
      const res = await t.request("POST", "/v1/auth/signup", {
        body: {
          email: overrides.email ?? `parent${emailCounter}@example.com`,
          password: overrides.password ?? PASSWORD,
          displayName: overrides.displayName ?? `Parent ${emailCounter}`,
        },
      });
      expectStatus(res, 201);
      return asSession(res.json<IssuedAuth>());
    },
    async createFamily(parent, name = "The Testers") {
      const res = await t.request("POST", "/v1/families", {
        session: parent,
        body: { name, timeZone: "America/Chicago" },
      });
      expectStatus(res, 201);
      return res.json<FamilyDetail>();
    },
    async addChild(parent, familyId, body = {}) {
      const res = await t.request("POST", `/v1/families/${familyId}/children`, {
        session: parent,
        body: { displayName: body.displayName ?? "Billy", ...(body.pin && { pin: body.pin }) },
      });
      expectStatus(res, 201);
      return res.json<Member>();
    },
    async switchTo(caller, familyId, membershipId, pin) {
      const res = await t.request(
        "POST",
        `/v1/families/${familyId}/members/${membershipId}/session`,
        { session: caller, body: pin === undefined ? {} : { pin } },
      );
      expectStatus(res, 200);
      return asSession(res.json<IssuedAuth>());
    },
    async refresh(session) {
      const res = await t.request("POST", "/v1/auth/refresh", {
        body: { refreshToken: session.tokens.refreshToken },
      });
      expectStatus(res, 200);
      return asSession({ user: session.user, tokens: res.json<IssuedTokens>() });
    },
    async createChore(parent, familyId, body = {}) {
      const res = await t.request("POST", `/v1/families/${familyId}/chores`, {
        session: parent,
        body: { ...DEFAULT_CHORE, ...body },
      });
      expectStatus(res, 201);
      return res.json<Chore>();
    },
    async agenda(session, familyId, query = "") {
      const res = await t.request("GET", `/v1/families/${familyId}/agenda${query}`, { session });
      expectStatus(res, 200);
      return res.json<AgendaResponse>();
    },
    async uploadPhoto(session, familyId, options = {}) {
      const res = await t.request("POST", `/v1/families/${familyId}/uploads`, {
        session,
        body: { purpose: options.purpose ?? "SUBMISSION", contentType: "image/jpeg" },
      });
      expectStatus(res, 201);
      const upload = res.json<CreateUploadResponse>();
      if (options.stored !== false) {
        storage.put(upload.fields.key ?? "", { ...(options.size && { size: options.size }) });
      }
      return upload.uploadId;
    },
  };
  return t;
}
