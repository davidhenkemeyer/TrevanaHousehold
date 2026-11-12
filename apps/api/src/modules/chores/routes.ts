import {
  addStarterChoresBodySchema,
  addStarterChoresResultSchema,
  choreListQuerySchema,
  choreListSchema,
  choreParamsSchema,
  choreSchema,
  createChoreBodySchema,
  familyParamsSchema,
  starterChoreListSchema,
  updateChoreBodySchema,
} from "@tenara/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Deps } from "../../deps.js";
import { createAuthenticateHook } from "../../plugins/authenticate.js";
import * as chores from "./service.js";
import * as starter from "./starter.js";

export const choreRoutes: FastifyPluginAsyncZod<{ deps: Deps }> = async (app, { deps }) => {
  app.addHook("onRequest", createAuthenticateHook(deps));

  app.post(
    "/families/:familyId/chores",
    {
      schema: {
        params: familyParamsSchema,
        body: createChoreBodySchema,
        response: { 201: choreSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await chores.createChore(deps, request.userId, request.params.familyId, request.body),
        ),
  );

  app.get(
    "/families/:familyId/starter-chores",
    { schema: { params: familyParamsSchema, response: { 200: starterChoreListSchema } } },
    async (request) => starter.listStarterChores(deps, request.userId, request.params.familyId),
  );

  app.post(
    "/families/:familyId/starter-chores",
    {
      schema: {
        params: familyParamsSchema,
        body: addStarterChoresBodySchema,
        response: { 201: addStarterChoresResultSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await starter.addStarterChores(
            deps,
            request.userId,
            request.params.familyId,
            request.body,
          ),
        ),
  );

  app.get(
    "/families/:familyId/chores",
    {
      schema: {
        params: familyParamsSchema,
        querystring: choreListQuerySchema,
        response: { 200: choreListSchema },
      },
    },
    async (request) =>
      chores.listChores(
        deps,
        request.userId,
        request.params.familyId,
        request.query.includeArchived,
      ),
  );

  app.get(
    "/families/:familyId/chores/:choreId",
    { schema: { params: choreParamsSchema, response: { 200: choreSchema } } },
    async (request) =>
      chores.getChore(deps, request.userId, request.params.familyId, request.params.choreId),
  );

  app.patch(
    "/families/:familyId/chores/:choreId",
    {
      schema: {
        params: choreParamsSchema,
        body: updateChoreBodySchema,
        response: { 200: choreSchema },
      },
    },
    async (request) =>
      chores.updateChore(
        deps,
        request.userId,
        request.params.familyId,
        request.params.choreId,
        request.body,
      ),
  );

  app.delete(
    "/families/:familyId/chores/:choreId",
    { schema: { params: choreParamsSchema, response: { 204: z.null() } } },
    async (request, reply) => {
      await chores.archiveChore(
        deps,
        request.userId,
        request.params.familyId,
        request.params.choreId,
      );
      return reply.status(204).send(null);
    },
  );
};
