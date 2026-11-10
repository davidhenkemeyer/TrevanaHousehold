import {
  authResponseSchema,
  createChildBodySchema,
  createFamilyBodySchema,
  familyDetailSchema,
  familyParamsSchema,
  memberParamsSchema,
  memberSchema,
  switchSessionBodySchema,
  updateFamilyBodySchema,
  updateMemberBodySchema,
} from "@titan/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Deps } from "../../deps.js";
import { createAuthenticateHook } from "../../plugins/authenticate.js";
import * as families from "./service.js";

export const familyRoutes: FastifyPluginAsyncZod<{ deps: Deps }> = async (app, { deps }) => {
  app.addHook("onRequest", createAuthenticateHook(deps));

  app.post(
    "/families",
    { schema: { body: createFamilyBodySchema, response: { 201: familyDetailSchema } } },
    async (request, reply) =>
      reply.status(201).send(await families.createFamily(deps, request.userId, request.body)),
  );

  app.get(
    "/families/:familyId",
    { schema: { params: familyParamsSchema, response: { 200: familyDetailSchema } } },
    async (request) => families.getFamily(deps, request.userId, request.params.familyId),
  );

  app.patch(
    "/families/:familyId",
    {
      schema: {
        params: familyParamsSchema,
        body: updateFamilyBodySchema,
        response: { 200: familyDetailSchema },
      },
    },
    async (request) =>
      families.updateFamily(deps, request.userId, request.params.familyId, request.body),
  );

  app.post(
    "/families/:familyId/children",
    {
      schema: {
        params: familyParamsSchema,
        body: createChildBodySchema,
        response: { 201: memberSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await families.createChild(deps, request.userId, request.params.familyId, request.body),
        ),
  );

  app.patch(
    "/families/:familyId/members/:membershipId",
    {
      schema: {
        params: memberParamsSchema,
        body: updateMemberBodySchema,
        response: { 200: memberSchema },
      },
    },
    async (request) =>
      families.updateMember(
        deps,
        request.userId,
        request.params.familyId,
        request.params.membershipId,
        request.body,
      ),
  );

  app.delete(
    "/families/:familyId/members/:membershipId",
    { schema: { params: memberParamsSchema, response: { 204: z.null() } } },
    async (request, reply) => {
      await families.removeMember(
        deps,
        request.userId,
        request.params.familyId,
        request.params.membershipId,
      );
      return reply.status(204).send(null);
    },
  );

  app.post(
    "/families/:familyId/members/:membershipId/session",
    {
      // Per signed-in account, not per IP: a whole household shares one IP (the
      // family iPad, kids' phones). PIN guessing is stopped by the per-profile
      // lockout in the service (5 wrong PINs lock it for 15 minutes).
      // "preHandler" so it runs after sign-in is checked and userId is known.
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
          hook: "preHandler",
          keyGenerator: (request) => `user:${request.userId}`,
        },
      },
      schema: {
        params: memberParamsSchema,
        body: switchSessionBodySchema,
        response: { 200: authResponseSchema },
      },
    },
    async (request) =>
      families.switchToMember(
        deps,
        request.userId,
        request.params.familyId,
        request.params.membershipId,
        request.body.pin,
      ),
  );
};
