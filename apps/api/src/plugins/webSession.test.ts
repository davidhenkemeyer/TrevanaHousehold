import type { AuthResponse, Tokens } from "@tenara/contracts";
import { describe, expect, it } from "vitest";
import { PASSWORD, useTestApp } from "../test/harness.js";
import { REFRESH_COOKIE } from "./webSession.js";

/** The web app's refresh token lives in an httpOnly cookie, never in JSON. */
describe("web sessions (refresh token in an httpOnly cookie)", () => {
  const t = useTestApp();
  const web = { "x-tenara-client": "web" };

  interface Cookie {
    name: string;
    value: string;
    expires?: Date;
    httpOnly?: boolean;
    sameSite?: string;
    path?: string;
  }
  const cookieFrom = (res: { cookies: Cookie[] }) =>
    res.cookies.find((c) => c.name === REFRESH_COOKIE);

  async function webLogin() {
    const mom = await t.signup({ email: "mom@example.com" });
    const res = await t.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: web,
      payload: { email: "mom@example.com", password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    return { mom, res };
  }

  it("sets the refresh token as an httpOnly cookie and leaves it out of the body", async () => {
    const { res } = await webLogin();
    const body = res.json<AuthResponse>();
    expect(body.tokens.accessToken).toBeTruthy();
    expect(body.tokens).not.toHaveProperty("refreshToken");
    expect(res.body).not.toContain(cookieFrom(res)?.value);

    const cookie = cookieFrom(res);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/v1/auth" });
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.expires).toBeInstanceOf(Date);
  });

  it("refreshes from the cookie, rotating it", async () => {
    const { res } = await webLogin();
    const first = cookieFrom(res)!.value;

    const refreshed = await t.app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      headers: web,
      cookies: { [REFRESH_COOKIE]: first },
      payload: {},
    });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json<Tokens>()).not.toHaveProperty("refreshToken");
    const second = cookieFrom(refreshed)!.value;
    expect(second).not.toBe(first);

    // The old one is spent (and reusing it ends every session, as for native).
    const reused = await t.app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      headers: web,
      cookies: { [REFRESH_COOKIE]: first },
      payload: {},
    });
    expect(reused.statusCode).toBe(401);
  });

  it("ignores the cookie without the web-client header (the CSRF guard)", async () => {
    const { res } = await webLogin();
    const refreshed = await t.app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      cookies: { [REFRESH_COOKIE]: cookieFrom(res)!.value },
      payload: {},
    });
    expect(refreshed.statusCode).toBe(401);
    expect(refreshed.json().error.code).toBe("INVALID_REFRESH_TOKEN");
  });

  it("signs out: revokes the session and clears the cookie", async () => {
    const { res } = await webLogin();
    const token = cookieFrom(res)!.value;
    const out = await t.app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: web,
      cookies: { [REFRESH_COOKIE]: token },
      payload: {},
    });
    expect(out.statusCode).toBe(204);
    const cleared = cookieFrom(out);
    expect(cleared?.value).toBe("");
    expect(cleared?.expires?.getTime()).toBeLessThanOrEqual(Date.now());

    const after = await t.app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      headers: web,
      cookies: { [REFRESH_COOKIE]: token },
      payload: {},
    });
    expect(after.statusCode).toBe(401);
  });

  it("keeps native apps on the body token", async () => {
    const { mom } = await webLogin();
    expect(mom.tokens.refreshToken).toBeTruthy();
    const refreshed = await t.request("POST", "/v1/auth/refresh", {
      body: { refreshToken: mom.tokens.refreshToken },
    });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json<Tokens>().refreshToken).toBeTruthy();
    expect(cookieFrom(refreshed)).toBeUndefined();
  });

  it("uses the cookie for profile switching too", async () => {
    const mom = await t.signup();
    const { family } = await t.createFamily(mom);
    const kid = await t.addChild(mom, family.id, { pin: "1234" });
    const res = await t.app.inject({
      method: "POST",
      url: `/v1/families/${family.id}/members/${kid.id}/session`,
      headers: { ...mom.headers, ...web },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<AuthResponse>().tokens).not.toHaveProperty("refreshToken");
    expect(cookieFrom(res)?.value).toBeTruthy();
  });

  it("allows credentialed requests only from listed origins", async () => {
    const preflight = (origin: string) =>
      t.app.inject({
        method: "OPTIONS",
        url: "/v1/auth/refresh",
        headers: {
          origin,
          "access-control-request-method": "POST",
          "access-control-request-headers": "x-tenara-client,content-type",
        },
      });
    const evil = await preflight("https://evil.example.com");
    expect(evil.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
