import { describe, expect, it, vi } from "vitest";
import { ApiError, createHttpClient } from "./http";

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const apiError = (status: number, code: string, message = "nope") =>
  json(status, { error: { code, message } });

function setup(responses: Response[], token = "old-token") {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const r of responses) fetch.mockResolvedValueOnce(r);
  const refreshAccessToken = vi.fn(async () => "new-token");
  const client = createHttpClient({
    baseUrl: "http://api.test",
    fetch,
    getAccessToken: () => token,
    refreshAccessToken,
  });
  return { client, fetch, refreshAccessToken };
}

const authHeader = (call: Parameters<typeof fetch>) =>
  (call[1]?.headers as Record<string, string>).authorization;

describe("http client", () => {
  it("sends JSON with the access token and parses the reply", async () => {
    const { client, fetch } = setup([json(200, { ok: true })]);
    await expect(client.request("POST", "/v1/x", { a: 1 })).resolves.toEqual({ ok: true });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("http://api.test/v1/x");
    expect(init).toMatchObject({ method: "POST", body: '{"a":1}' });
    expect(authHeader(fetch.mock.calls[0]!)).toBe("Bearer old-token");
  });

  it("refreshes once and retries when the access token has expired", async () => {
    const { client, fetch, refreshAccessToken } = setup([
      apiError(401, "INVALID_ACCESS_TOKEN"),
      json(200, { ok: true }),
    ]);
    await expect(client.request("GET", "/v1/me")).resolves.toEqual({ ok: true });
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(authHeader(fetch.mock.calls[1]!)).toBe("Bearer new-token");
  });

  it("does NOT retry other 401s, like a wrong PIN (that would cost another guess)", async () => {
    const { client, fetch, refreshAccessToken } = setup([
      apiError(401, "INVALID_PIN", "That PIN isn't right."),
    ]);
    const error = await client
      .request("POST", "/v1/families/f/members/m/session", { pin: "0000" })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 401,
      code: "INVALID_PIN",
      message: "That PIN isn't right.",
    });
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sends no token on public endpoints", async () => {
    const { client, fetch } = setup([json(200, {})]);
    await client.request("POST", "/v1/auth/login", {}, { auth: false });
    expect(authHeader(fetch.mock.calls[0]!)).toBeUndefined();
  });

  it("handles 204 No Content", async () => {
    const { client } = setup([new Response(null, { status: 204 })]);
    await expect(client.request("DELETE", "/v1/x")).resolves.toBeUndefined();
  });

  it("turns network failures into a friendly error", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    const client = createHttpClient({
      baseUrl: "http://api.test",
      fetch,
      getAccessToken: () => null,
      refreshAccessToken: async () => null,
    });
    await expect(client.request("GET", "/v1/me")).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });

  it("on the web, identifies itself and sends cookies (the refresh token is one)", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json(200, {}));
    const client = createHttpClient({
      baseUrl: "http://api.test",
      fetch,
      getAccessToken: () => null,
      refreshAccessToken: async () => null,
      browser: true,
    });
    await client.request("POST", "/v1/auth/refresh", {}, { auth: false });
    const init = fetch.mock.calls[0]?.[1];
    expect(init?.credentials).toBe("include");
    expect((init?.headers as Record<string, string>)["x-tenara-client"]).toBe("web");
  });
});
