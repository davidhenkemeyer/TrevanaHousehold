/**
 * Refresh tokens for the web app travel in an httpOnly cookie, not in JSON,
 * so scripts on the page can never read them (an XSS can't steal a
 * long-lived session). Native apps keep getting the token in the body and
 * store it in the OS keychain (SecureStore).
 *
 * A request is from the web app when it sends `X-Tenara-Client: web`. That
 * header is also the CSRF guard: a cross-site form can't set headers, and a
 * cross-origin fetch that sets one is preflighted and refused by CORS for any
 * origin not in CORS_ORIGINS. On top of that the cookie is SameSite=Lax and
 * scoped to /v1/auth, so it only goes to refresh and logout.
 */
import type { Tokens } from "@tenara/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";

export const WEB_CLIENT_HEADER = "x-tenara-client";
export const REFRESH_COOKIE = "tenara_rt";
const COOKIE_PATH = "/v1/auth";

export function isWebClient(request: FastifyRequest): boolean {
  return request.headers[WEB_CLIENT_HEADER] === "web";
}

/**
 * The tokens to put in a response. For the web app, the refresh token is set
 * as a cookie and left out of the body.
 */
export function deliverTokens(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig,
  tokens: Tokens,
): Tokens {
  if (!isWebClient(request) || tokens.refreshToken === undefined) return tokens;
  reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax",
    path: COOKIE_PATH,
    expires: new Date(tokens.refreshTokenExpiresAt),
  });
  const { refreshToken: _omitted, ...rest } = tokens;
  return rest;
}

/** The refresh token a request presents: in the body (native) or the cookie (web). */
export function presentedRefreshToken(
  request: FastifyRequest,
  body: { refreshToken?: string | undefined } | undefined,
): string | undefined {
  if (body?.refreshToken) return body.refreshToken;
  // The cookie counts only with the web-client header (the CSRF guard above).
  return isWebClient(request) ? request.cookies[REFRESH_COOKIE] : undefined;
}

export function clearRefreshCookie(reply: FastifyReply, config: AppConfig): void {
  reply.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax",
    path: COOKIE_PATH,
  });
}
