/**
 * Minimal HTTP client for the Titan API.
 *
 * - Adds the access token to every authenticated request.
 * - When the API says the access token expired, refreshes once and retries.
 *   Only for that reason: other 401s (a wrong PIN, wrong password) are real
 *   answers, and retrying them would count as another guess.
 * - Turns error responses into ApiError with the API's stable `code` and its
 *   human-readable `message`, which screens can show as-is.
 */
import type { ErrorResponse } from "@titan/contracts";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** 401 codes that mean "your access token is stale", where refreshing can help. */
const REFRESHABLE = new Set(["INVALID_ACCESS_TOKEN", "AUTH_REQUIRED"]);

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface HttpClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  /** The current access token, or null when signed out. */
  getAccessToken: () => string | null;
  /** Gets a fresh access token. Returns null when the session has ended. */
  refreshAccessToken: () => Promise<string | null>;
}

export interface HttpClient {
  request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    opts?: { auth?: boolean },
  ): Promise<T>;
}

const networkError = () =>
  new ApiError(
    0,
    "NETWORK_ERROR",
    "Can't reach Titan right now. Check your connection and try again.",
  );

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function toError(status: number, data: unknown): ApiError {
  const err = (data as Partial<ErrorResponse> | undefined)?.error;
  return new ApiError(
    status,
    err?.code ?? "HTTP_ERROR",
    err?.message ?? `Request failed (${status}).`,
  );
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));

  async function send(method: HttpMethod, path: string, body: unknown, token: string | null) {
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (token) headers.authorization = `Bearer ${token}`;
    try {
      return await doFetch(options.baseUrl + path, {
        method,
        headers,
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
    } catch {
      throw networkError();
    }
  }

  return {
    async request<T>(
      method: HttpMethod,
      path: string,
      body?: unknown,
      opts: { auth?: boolean } = {},
    ) {
      const auth = opts.auth ?? true;
      let res = await send(method, path, body, auth ? options.getAccessToken() : null);
      let data = await readJson(res);

      if (auth && res.status === 401) {
        const code = (data as Partial<ErrorResponse> | undefined)?.error?.code;
        if (code !== undefined && REFRESHABLE.has(code)) {
          const fresh = await options.refreshAccessToken();
          if (fresh) {
            res = await send(method, path, body, fresh);
            data = await readJson(res);
          }
        }
      }
      if (!res.ok) throw toError(res.status, data);
      return data as T;
    },
  };
}
