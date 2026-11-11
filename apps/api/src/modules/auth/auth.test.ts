import type { MeResponse } from "@titan/contracts";
import type { IssuedTokens } from "./sessions.js";
import { describe, expect, it } from "vitest";
import { PASSWORD, days, minutes, useTestApp } from "../../test/harness.js";

describe("auth", () => {
  const t = useTestApp();

  describe("signup", () => {
    it("creates an account and signs the user in", async () => {
      const mom = await t.signup({ email: "  Mom@Example.com ", displayName: "Mom" });
      expect(mom.user).toMatchObject({ email: "mom@example.com", displayName: "Mom" });
      expect(mom.tokens.accessToken).toBeTruthy();
      expect(mom.tokens.refreshToken).toBeTruthy();

      const me = await t.request("GET", "/v1/me", { session: mom });
      expect(me.statusCode).toBe(200);
      expect(me.json<MeResponse>()).toEqual({ user: mom.user, memberships: [] });
    });

    it("never returns or stores the password in plain text", async () => {
      const mom = await t.signup();
      const row = await t.db.user.findUniqueOrThrow({ where: { id: mom.user.id } });
      expect(row.passwordHash).toMatch(/^\$argon2id\$/);
      expect(JSON.stringify(mom)).not.toContain("passwordHash");
    });

    it("rejects a duplicate email, regardless of case", async () => {
      await t.signup({ email: "mom@example.com" });
      const res = await t.request("POST", "/v1/auth/signup", {
        body: { email: "MOM@example.com", password: PASSWORD, displayName: "Imposter" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("EMAIL_TAKEN");
    });

    it("validates input with field-level details", async () => {
      const res = await t.request("POST", "/v1/auth/signup", {
        body: { email: "not-an-email", password: "short", displayName: "" },
      });
      expect(res.statusCode).toBe(400);
      const { error } = res.json();
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.details.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("login", () => {
    it("signs in with the right password", async () => {
      await t.signup({ email: "dad@example.com" });
      const res = await t.request("POST", "/v1/auth/login", {
        body: { email: "DAD@example.com", password: PASSWORD },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().user.email).toBe("dad@example.com");
    });

    it("gives the same answer for a wrong password and an unknown email", async () => {
      await t.signup({ email: "dad@example.com" });
      const wrong = await t.request("POST", "/v1/auth/login", {
        body: { email: "dad@example.com", password: "nope nope nope" },
      });
      const unknown = await t.request("POST", "/v1/auth/login", {
        body: { email: "nobody@example.com", password: PASSWORD },
      });
      expect(wrong.statusCode).toBe(401);
      expect(unknown.statusCode).toBe(401);
      expect(wrong.json()).toEqual(unknown.json());
    });
  });

  describe("access tokens", () => {
    it("are required on protected routes", async () => {
      const res = await t.request("GET", "/v1/me");
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("AUTH_REQUIRED");
    });

    it("expire after 15 minutes", async () => {
      const mom = await t.signup();
      t.advance(minutes(14));
      expect((await t.request("GET", "/v1/me", { session: mom })).statusCode).toBe(200);
      t.advance(minutes(2));
      const res = await t.request("GET", "/v1/me", { session: mom });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("INVALID_ACCESS_TOKEN");
    });

    it("reject a tampered token", async () => {
      const mom = await t.signup();
      const [header, payload, signature] = mom.tokens.accessToken.split(".");
      const forged = `${header}.${payload}.${signature?.slice(0, -2)}xx`;
      const res = await t.app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { authorization: `Bearer ${forged}` },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("refresh tokens", () => {
    const refresh = (refreshToken: string) =>
      t.request("POST", "/v1/auth/refresh", { body: { refreshToken } });

    it("rotate: each refresh returns a new pair and retires the old token", async () => {
      const mom = await t.signup();
      const first = await refresh(mom.tokens.refreshToken);
      expect(first.statusCode).toBe(200);
      const next = first.json<IssuedTokens>();
      expect(next.refreshToken).not.toBe(mom.tokens.refreshToken);
      expect((await refresh(next.refreshToken)).statusCode).toBe(200);
    });

    it("revoke every session when a used token is replayed", async () => {
      const mom = await t.signup();
      const next = (await refresh(mom.tokens.refreshToken)).json<IssuedTokens>();

      // Someone replays the original (stolen) token...
      const replay = await refresh(mom.tokens.refreshToken);
      expect(replay.statusCode).toBe(401);
      // ...so the legitimate newer token is revoked too, forcing a fresh sign-in.
      expect((await refresh(next.refreshToken)).statusCode).toBe(401);
    });

    it("expire after 60 days", async () => {
      const mom = await t.signup();
      t.advance(days(60) + 1000);
      expect((await refresh(mom.tokens.refreshToken)).statusCode).toBe(401);
    });

    it("stop working after logout, and logout is idempotent", async () => {
      const mom = await t.signup();
      const body = { refreshToken: mom.tokens.refreshToken };
      expect((await t.request("POST", "/v1/auth/logout", { body })).statusCode).toBe(204);
      expect((await t.request("POST", "/v1/auth/logout", { body })).statusCode).toBe(204);
      expect((await refresh(mom.tokens.refreshToken)).statusCode).toBe(401);
    });

    it("reject unknown tokens", async () => {
      expect((await refresh("made-up-token")).statusCode).toBe(401);
    });
  });

  describe("PATCH /me", () => {
    it("updates the display name and color", async () => {
      const mom = await t.signup();
      const res = await t.request("PATCH", "/v1/me", {
        session: mom,
        body: { displayName: "Mama", avatarColor: "#123ABC" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ displayName: "Mama", avatarColor: "#123ABC" });
    });

    it("does not allow changing the email this way", async () => {
      const mom = await t.signup();
      const res = await t.request("PATCH", "/v1/me", {
        session: mom,
        body: { email: "new@example.com" },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
