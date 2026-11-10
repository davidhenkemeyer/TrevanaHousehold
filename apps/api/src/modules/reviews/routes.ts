import {
  batchApproveBodySchema,
  batchApproveResponseSchema,
  familyParamsSchema,
  reviewBodySchema,
  reviewQueueQuerySchema,
  reviewQueueSchema,
  reviewResponseSchema,
  submissionParamsSchema,
} from "@titan/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Deps } from "../../deps.js";
import { createAuthenticateHook } from "../../plugins/authenticate.js";
import * as reviews from "./service.js";

export const reviewRoutes: FastifyPluginAsyncZod<{ deps: Deps }> = async (app, { deps }) => {
  app.addHook("onRequest", createAuthenticateHook(deps));

  app.get(
    "/families/:familyId/review-queue",
    {
      schema: {
        params: familyParamsSchema,
        querystring: reviewQueueQuerySchema,
        response: { 200: reviewQueueSchema },
      },
    },
    async (request) =>
      reviews.getReviewQueue(deps, request.userId, request.params.familyId, request.query),
  );

  app.post(
    "/families/:familyId/submissions/:submissionId/review",
    {
      schema: {
        params: submissionParamsSchema,
        body: reviewBodySchema,
        response: { 200: reviewResponseSchema },
      },
    },
    async (request) =>
      reviews.reviewSubmission(
        deps,
        request.userId,
        request.params.familyId,
        request.params.submissionId,
        request.body,
      ),
  );

  app.post(
    "/families/:familyId/review-queue/approve",
    {
      schema: {
        params: familyParamsSchema,
        body: batchApproveBodySchema,
        response: { 200: batchApproveResponseSchema },
      },
    },
    async (request) =>
      reviews.batchApprove(
        deps,
        request.userId,
        request.params.familyId,
        request.body.submissionIds,
      ),
  );
};
