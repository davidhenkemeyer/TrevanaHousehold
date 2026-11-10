import {
  authResponseSchema,
  memberParamsSchema,
  pairBodySchema,
  pairingCodeResponseSchema,
} from "@titan/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Deps } from "../../deps.js";
import { createAuthenticateHook } from "../../plugins/authenticate.js";
import * as pairing from "./service.js";

/** Parent side: issue a code for a kid's phone. */
export const pairingRoutes: FastifyPluginAsyncZod<{ deps: Deps }> = async (app, { deps }) => {
  app.addHook("onRequest", createAuthenticateHook(deps));

  app.post(
    "/families/:familyId/members/:membershipId/pairing-code",
    { schema: { params: memberParamsSchema, response: { 201: pairingCodeResponseSchema } } },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await pairing.createPairingCode(
            deps,
            request.userId,
            request.params.familyId,
            request.params.membershipId,
          ),
        ),
  );
};

/** Kid's phone side: public, since the phone isn't signed in yet. Rate-limited against guessing. */
export const pairingPublicRoutes: FastifyPluginAsyncZod<{ deps: Deps }> = async (app, { deps }) => {
  app.post(
    "/auth/pair",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: { body: pairBodySchema, response: { 200: authResponseSchema } },
    },
    async (request) => pairing.pair(deps, request.body.code),
  );
};
