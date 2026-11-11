import {
  createGoalBodySchema,
  familyGoalSchema,
  familyParamsSchema,
  progressSchema,
} from "@titan/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Deps } from "../../deps.js";
import { createAuthenticateHook } from "../../plugins/authenticate.js";
import * as progress from "./service.js";

export const progressRoutes: FastifyPluginAsyncZod<{ deps: Deps }> = async (app, { deps }) => {
  app.addHook("onRequest", createAuthenticateHook(deps));

  app.get(
    "/families/:familyId/progress",
    { schema: { params: familyParamsSchema, response: { 200: progressSchema } } },
    async (request) => progress.getProgress(deps, request.userId, request.params.familyId),
  );

  app.post(
    "/families/:familyId/goal",
    {
      schema: {
        params: familyParamsSchema,
        body: createGoalBodySchema,
        response: { 201: familyGoalSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await progress.startGoal(deps, request.userId, request.params.familyId, request.body),
        ),
  );

  app.delete(
    "/families/:familyId/goal",
    { schema: { params: familyParamsSchema, response: { 204: z.null() } } },
    async (request, reply) => {
      await progress.closeGoal(deps, request.userId, request.params.familyId);
      return reply.status(204).send(null);
    },
  );
};
