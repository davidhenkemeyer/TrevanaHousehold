import {
  authResponseSchema,
  errorResponseSchema,
  loginBodySchema,
  meResponseSchema,
  refreshBodySchema,
  signupBodySchema,
  tokensSchema,
  updateMeBodySchema,
  userSchema,
} from "@tenara/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Deps } from "../../deps.js";
import { createAuthenticateHook } from "../../plugins/authenticate.js";
import {
  clearRefreshCookie,
  deliverTokens,
  presentedRefreshToken,
} from "../../plugins/webSession.js";
import { unauthorized } from "../../errors.js";
import * as auth from "./service.js";

/** Tight limits on credential endpoints to slow down password guessing. */
const credentialLimit = { rateLimit: { max: 10, timeWindow: "1 minute" } };

/** Public routes: no access token needed. */
export const authRoutes: FastifyPluginAsyncZod<{ deps: Deps }> = async (app, { deps }) => {
  app.post(
    "/auth/signup",
    {
      config: credentialLimit,
      schema: {
        body: signupBodySchema,
        response: { 201: authResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await auth.signup(deps, request.body);
      const tokens = deliverTokens(request, reply, deps.config, result.tokens);
      return reply.status(201).send({ ...result, tokens });
    },
  );

  app.post(
    "/auth/login",
    {
      config: credentialLimit,
      schema: {
        body: loginBodySchema,
        response: { 200: authResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await auth.login(deps, request.body);
      return { ...result, tokens: deliverTokens(request, reply, deps.config, result.tokens) };
    },
  );

  app.post(
    "/auth/refresh",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        body: refreshBodySchema,
        response: { 200: tokensSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const token = presentedRefreshToken(request, request.body);
      if (!token)
        throw unauthorized("INVALID_REFRESH_TOKEN", "Your session has ended. Sign in again.");
      return deliverTokens(request, reply, deps.config, await auth.refresh(deps, token));
    },
  );

  app.post(
    "/auth/logout",
    { schema: { body: refreshBodySchema, response: { 204: z.null() } } },
    async (request, reply) => {
      const token = presentedRefreshToken(request, request.body);
      if (token) await auth.logout(deps, token);
      clearRefreshCookie(reply, deps.config);
      return reply.status(204).send(null);
    },
  );
};

/** The signed-in user's own account. */
export const meRoutes: FastifyPluginAsyncZod<{ deps: Deps }> = async (app, { deps }) => {
  app.addHook("onRequest", createAuthenticateHook(deps));

  app.get("/me", { schema: { response: { 200: meResponseSchema } } }, async (request) =>
    auth.getMe(deps, request.userId),
  );

  app.patch(
    "/me",
    { schema: { body: updateMeBodySchema, response: { 200: userSchema } } },
    async (request) => auth.updateMe(deps, request.userId, request.body),
  );
};
