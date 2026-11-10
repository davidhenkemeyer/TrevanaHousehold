/**
 * Bearer-token authentication. Register routes that need a signed-in user
 * inside a plugin that adds this hook; `request.userId` is then guaranteed.
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Deps } from "../deps.js";
import { unauthorized } from "../errors.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Set by the authenticate hook. Empty string on routes that don't use it. */
    userId: string;
  }
}

export function createAuthenticateHook(deps: Deps) {
  return async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const header = request.headers.authorization;
    const match = header ? /^Bearer\s+(\S+)$/i.exec(header) : null;
    if (!match?.[1]) {
      throw unauthorized("AUTH_REQUIRED", "Sign in to continue.");
    }
    const userId = await deps.accessTokens.verify(match[1], deps.now());
    if (!userId) {
      throw unauthorized("INVALID_ACCESS_TOKEN", "Your session has expired. Sign in again.");
    }
    request.userId = userId;
  };
}
