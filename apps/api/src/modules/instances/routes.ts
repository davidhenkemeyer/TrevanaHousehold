import {
  agendaQuerySchema,
  agendaResponseSchema,
  familyParamsSchema,
  instanceActionBodySchema,
  instanceDetailSchema,
  instanceListQuerySchema,
  instanceListSchema,
  instanceParamsSchema,
  instanceSchema,
  replanResponseSchema,
  submitBodySchema,
  submitResponseSchema,
  weekLoadQuerySchema,
  weekLoadSchema,
} from "@tenara/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Deps } from "../../deps.js";
import { createAuthenticateHook } from "../../plugins/authenticate.js";
import * as instances from "./service.js";

export const instanceRoutes: FastifyPluginAsyncZod<{ deps: Deps }> = async (app, { deps }) => {
  app.addHook("onRequest", createAuthenticateHook(deps));

  app.get(
    "/families/:familyId/agenda",
    {
      schema: {
        params: familyParamsSchema,
        querystring: agendaQuerySchema,
        response: { 200: agendaResponseSchema },
      },
    },
    async (request) =>
      instances.getAgenda(deps, request.userId, request.params.familyId, request.query),
  );

  app.get(
    "/families/:familyId/instances",
    {
      schema: {
        params: familyParamsSchema,
        querystring: instanceListQuerySchema,
        response: { 200: instanceListSchema },
      },
    },
    async (request) =>
      instances.listInstances(deps, request.userId, request.params.familyId, request.query),
  );

  app.get(
    "/families/:familyId/week-load",
    {
      schema: {
        params: familyParamsSchema,
        querystring: weekLoadQuerySchema,
        response: { 200: weekLoadSchema },
      },
    },
    async (request) =>
      instances.getWeekLoad(deps, request.userId, request.params.familyId, request.query),
  );

  app.get(
    "/families/:familyId/instances/:instanceId",
    { schema: { params: instanceParamsSchema, response: { 200: instanceDetailSchema } } },
    async (request) =>
      instances.getInstanceDetail(
        deps,
        request.userId,
        request.params.familyId,
        request.params.instanceId,
      ),
  );

  app.post(
    "/families/:familyId/instances/:instanceId/actions",
    {
      schema: {
        params: instanceParamsSchema,
        body: instanceActionBodySchema,
        response: { 200: instanceSchema },
      },
    },
    async (request) =>
      instances.actOnInstance(
        deps,
        request.userId,
        request.params.familyId,
        request.params.instanceId,
        request.body,
      ),
  );

  app.post(
    "/families/:familyId/instances/:instanceId/submissions",
    {
      schema: {
        params: instanceParamsSchema,
        body: submitBodySchema,
        response: { 201: submitResponseSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await instances.submitInstance(
            deps,
            request.userId,
            request.params.familyId,
            request.params.instanceId,
            request.body,
          ),
        ),
  );

  app.post(
    "/families/:familyId/schedule/replan",
    { schema: { params: familyParamsSchema, response: { 200: replanResponseSchema } } },
    async (request) => instances.replanFamily(deps, request.userId, request.params.familyId),
  );
};
