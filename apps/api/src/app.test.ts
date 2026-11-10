import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db.js";
import { useTestApp } from "./test/harness.js";
import { testDatabaseUrl } from "./test/testDatabase.js";

describe("rate limiting", () => {
  it("throttles repeated login attempts with a 429 in the contract shape", async () => {
    // The shared harness turns rate limits off; build an app with them on.
    const config = loadConfig({
      DATABASE_URL: testDatabaseUrl(),
      JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
      LOG_LEVEL: "silent",
    });
    const db = createDb(config.databaseUrl);
    const app = await buildApp({ config, db });
    try {
      const attempt = () =>
        app.inject({
          method: "POST",
          url: "/v1/auth/login",
          payload: { email: "nobody@example.com", password: "whatever-password" },
        });
      for (let i = 0; i < 10; i++) expect((await attempt()).statusCode).toBe(401);
      const limited = await attempt();
      expect(limited.statusCode).toBe(429);
      expect(limited.json().error.code).toBe("RATE_LIMITED");
    } finally {
      await app.close();
      await db.$disconnect();
    }
  });
});

describe("switching person: rate limited per account, not per IP", () => {
  it("lets each account switch 10 times a minute, even from the same IP", async () => {
    const config = loadConfig({
      DATABASE_URL: testDatabaseUrl(),
      JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
      LOG_LEVEL: "silent",
    });
    const db = createDb(config.databaseUrl);
    const app = await buildApp({ config, db });
    try {
      const unique = Date.now();
      // Two parents in different families, on the same network.
      const parentWithKid = async (n: number) => {
        const signup = await app.inject({
          method: "POST",
          url: "/v1/auth/signup",
          payload: {
            email: `switch-limit-${unique}-${n}@example.com`,
            password: "correct horse battery",
            displayName: `Parent ${n}`,
          },
        });
        const headers = { authorization: `Bearer ${signup.json().tokens.accessToken}` };
        const family = await app.inject({
          method: "POST",
          url: "/v1/families",
          headers,
          payload: { name: "Limits", timeZone: "America/Chicago" },
        });
        const familyId = family.json().family.id;
        const kid = await app.inject({
          method: "POST",
          url: `/v1/families/${familyId}/children`,
          headers,
          payload: { displayName: "Kid" },
        });
        const url = `/v1/families/${familyId}/members/${kid.json().id}/session`;
        return () => app.inject({ method: "POST", url, headers, payload: {} });
      };
      const a = await parentWithKid(1);
      const b = await parentWithKid(2);

      for (let i = 0; i < 10; i++) expect((await a()).statusCode).toBe(200);
      const limited = await a();
      expect(limited.statusCode).toBe(429);
      expect(limited.json().error.code).toBe("RATE_LIMITED");
      // The other account on the same IP isn't affected.
      expect((await b()).statusCode).toBe(200);
    } finally {
      await app.close();
      await db.$disconnect();
    }
  });
});

describe("CORS (web app)", () => {
  const WEB_ORIGIN = "http://localhost:8081";
  const config = loadConfig({
    DATABASE_URL: testDatabaseUrl(),
    JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
    LOG_LEVEL: "silent",
    CORS_ORIGINS: WEB_ORIGIN,
  });
  const preflight = async (origin: string, method: string) => {
    const db = createDb(config.databaseUrl);
    const app = await buildApp({ config, db });
    try {
      return await app.inject({
        method: "OPTIONS",
        url: "/v1/families/x/members/y",
        headers: {
          origin,
          "access-control-request-method": method,
          "access-control-request-headers": "authorization,content-type",
        },
      });
    } finally {
      await app.close();
      await db.$disconnect();
    }
  };

  // @fastify/cors allows only GET/HEAD/POST unless told otherwise; the app uses PATCH and DELETE.
  it.each(["GET", "POST", "PATCH", "DELETE"])("allows %s from the web app", async (method) => {
    const res = await preflight(WEB_ORIGIN, method);
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(WEB_ORIGIN);
    const allowed = String(res.headers["access-control-allow-methods"]).split(/,\s*/);
    expect(allowed).toContain(method);
  });

  it("doesn't allow other origins", async () => {
    const res = await preflight("https://evil.example", "GET");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("app basics", () => {
  const t = useTestApp();

  it("reports health, including the database", async () => {
    const res = await t.request("GET", "/health");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("returns errors in the contract shape for unknown routes", async () => {
    const res = await t.request("GET", "/v1/nope");
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: { code: "ROUTE_NOT_FOUND", message: expect.any(String) },
    });
  });

  it("rejects malformed JSON with a 400 in the contract shape", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBeTruthy();
  });

  it("validates route params (ids must be UUIDs)", async () => {
    const mom = await t.signup();
    const res = await t.request("GET", "/v1/families/not-a-uuid", { session: mom });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });
});
