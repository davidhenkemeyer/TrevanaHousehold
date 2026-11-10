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
