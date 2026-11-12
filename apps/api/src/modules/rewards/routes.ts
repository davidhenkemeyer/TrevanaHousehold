import {
  correctionBodySchema,
  createRedemptionBodySchema,
  createRewardItemBodySchema,
  familyParamsSchema,
  jobBoardSchema,
  ledgerChangeResponseSchema,
  ledgerPageSchema,
  ledgerQuerySchema,
  payoutBodySchema,
  redemptionDecisionBodySchema,
  redemptionListSchema,
  redemptionParamsSchema,
  redemptionQuerySchema,
  redemptionSchema,
  rewardItemListSchema,
  rewardItemParamsSchema,
  rewardItemSchema,
  rewardsSummarySchema,
  updateRewardItemBodySchema,
} from "@tenara/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Deps } from "../../deps.js";
import { createAuthenticateHook } from "../../plugins/authenticate.js";
import * as rewards from "./service.js";

export const rewardRoutes: FastifyPluginAsyncZod<{ deps: Deps }> = async (app, { deps }) => {
  app.addHook("onRequest", createAuthenticateHook(deps));

  // Balances and history

  app.get(
    "/families/:familyId/rewards",
    { schema: { params: familyParamsSchema, response: { 200: rewardsSummarySchema } } },
    async (request) => rewards.getRewards(deps, request.userId, request.params.familyId),
  );

  app.get(
    "/families/:familyId/rewards/ledger",
    {
      schema: {
        params: familyParamsSchema,
        querystring: ledgerQuerySchema,
        response: { 200: ledgerPageSchema },
      },
    },
    async (request) =>
      rewards.getLedger(deps, request.userId, request.params.familyId, request.query),
  );

  app.post(
    "/families/:familyId/rewards/payouts",
    {
      schema: {
        params: familyParamsSchema,
        body: payoutBodySchema,
        response: { 201: ledgerChangeResponseSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await rewards.recordPayout(deps, request.userId, request.params.familyId, request.body),
        ),
  );

  app.post(
    "/families/:familyId/rewards/corrections",
    {
      schema: {
        params: familyParamsSchema,
        body: correctionBodySchema,
        response: { 201: ledgerChangeResponseSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await rewards.recordCorrection(
            deps,
            request.userId,
            request.params.familyId,
            request.body,
          ),
        ),
  );

  // The points catalog

  app.get(
    "/families/:familyId/reward-items",
    { schema: { params: familyParamsSchema, response: { 200: rewardItemListSchema } } },
    async (request) => rewards.listRewardItems(deps, request.userId, request.params.familyId),
  );

  app.post(
    "/families/:familyId/reward-items",
    {
      schema: {
        params: familyParamsSchema,
        body: createRewardItemBodySchema,
        response: { 201: rewardItemSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await rewards.createRewardItem(
            deps,
            request.userId,
            request.params.familyId,
            request.body,
          ),
        ),
  );

  app.patch(
    "/families/:familyId/reward-items/:itemId",
    {
      schema: {
        params: rewardItemParamsSchema,
        body: updateRewardItemBodySchema,
        response: { 200: rewardItemSchema },
      },
    },
    async (request) =>
      rewards.updateRewardItem(
        deps,
        request.userId,
        request.params.familyId,
        request.params.itemId,
        request.body,
      ),
  );

  app.delete(
    "/families/:familyId/reward-items/:itemId",
    { schema: { params: rewardItemParamsSchema, response: { 204: z.null() } } },
    async (request, reply) => {
      await rewards.removeRewardItem(
        deps,
        request.userId,
        request.params.familyId,
        request.params.itemId,
      );
      return reply.status(204).send(null);
    },
  );

  // Redemption requests

  app.get(
    "/families/:familyId/redemptions",
    {
      schema: {
        params: familyParamsSchema,
        querystring: redemptionQuerySchema,
        response: { 200: redemptionListSchema },
      },
    },
    async (request) =>
      rewards.listRedemptions(deps, request.userId, request.params.familyId, request.query),
  );

  app.post(
    "/families/:familyId/redemptions",
    {
      schema: {
        params: familyParamsSchema,
        body: createRedemptionBodySchema,
        response: { 201: redemptionSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await rewards.requestRedemption(
            deps,
            request.userId,
            request.params.familyId,
            request.body.itemId,
          ),
        ),
  );

  app.post(
    "/families/:familyId/redemptions/:redemptionId/decision",
    {
      schema: {
        params: redemptionParamsSchema,
        body: redemptionDecisionBodySchema,
        response: { 200: redemptionSchema },
      },
    },
    async (request) =>
      rewards.decideRedemption(
        deps,
        request.userId,
        request.params.familyId,
        request.params.redemptionId,
        request.body,
      ),
  );

  app.post(
    "/families/:familyId/redemptions/:redemptionId/cancel",
    { schema: { params: redemptionParamsSchema, response: { 200: redemptionSchema } } },
    async (request) =>
      rewards.cancelRedemption(
        deps,
        request.userId,
        request.params.familyId,
        request.params.redemptionId,
      ),
  );

  // Job board

  app.get(
    "/families/:familyId/job-board",
    { schema: { params: familyParamsSchema, response: { 200: jobBoardSchema } } },
    async (request) => rewards.getJobBoard(deps, request.userId, request.params.familyId),
  );
};
