import {
  acceptInviteBodySchema,
  acceptInviteResponseSchema,
  createInviteBodySchema,
  createInviteResponseSchema,
  familyParamsSchema,
  inviteListSchema,
  inviteParamsSchema,
} from "@chores/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Deps } from "../../deps.js";
import { createAuthenticateHook } from "../../plugins/authenticate.js";
import * as invites from "./service.js";

export const inviteRoutes: FastifyPluginAsyncZod<{ deps: Deps }> = async (app, { deps }) => {
  app.addHook("onRequest", createAuthenticateHook(deps));

  app.post(
    "/families/:familyId/invites",
    {
      schema: {
        params: familyParamsSchema,
        body: createInviteBodySchema,
        response: { 201: createInviteResponseSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await invites.createInvite(deps, request.userId, request.params.familyId, request.body),
        ),
  );

  app.get(
    "/families/:familyId/invites",
    { schema: { params: familyParamsSchema, response: { 200: inviteListSchema } } },
    async (request) => invites.listInvites(deps, request.userId, request.params.familyId),
  );

  app.delete(
    "/families/:familyId/invites/:inviteId",
    { schema: { params: inviteParamsSchema, response: { 204: z.null() } } },
    async (request, reply) => {
      await invites.revokeInvite(
        deps,
        request.userId,
        request.params.familyId,
        request.params.inviteId,
      );
      return reply.status(204).send(null);
    },
  );

  app.post(
    "/invites/accept",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: { body: acceptInviteBodySchema, response: { 200: acceptInviteResponseSchema } },
    },
    async (request) => invites.acceptInvite(deps, request.userId, request.body.token),
  );
};
