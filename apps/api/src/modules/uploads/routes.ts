import {
  createUploadBodySchema,
  createUploadResponseSchema,
  familyParamsSchema,
} from "@titan/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Deps } from "../../deps.js";
import { createAuthenticateHook } from "../../plugins/authenticate.js";
import * as uploads from "./service.js";

export const uploadRoutes: FastifyPluginAsyncZod<{ deps: Deps }> = async (app, { deps }) => {
  app.addHook("onRequest", createAuthenticateHook(deps));

  app.post(
    "/families/:familyId/uploads",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        params: familyParamsSchema,
        body: createUploadBodySchema,
        response: { 201: createUploadResponseSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await uploads.createUpload(deps, request.userId, request.params.familyId, request.body),
        ),
  );
};
