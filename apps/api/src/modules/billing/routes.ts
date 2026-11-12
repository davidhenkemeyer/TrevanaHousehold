import { familyParamsSchema, planSchema } from "@tenara/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Deps } from "../../deps.js";
import { createAuthenticateHook } from "../../plugins/authenticate.js";
import * as billing from "./service.js";

/** RevenueCat's webhook. Authenticated by its Authorization header, not a user token. */
export const billingWebhookRoutes: FastifyPluginAsyncZod<{ deps: Deps }> = async (
  app,
  { deps },
) => {
  app.post(
    "/billing/revenuecat",
    {
      schema: {
        body: z.looseObject({
          event: z.looseObject({
            app_user_id: z.string().optional(),
            original_app_user_id: z.string().optional(),
            aliases: z.array(z.string()).optional(),
            transferred_from: z.array(z.string()).optional(),
            transferred_to: z.array(z.string()).optional(),
          }),
        }),
        response: { 200: z.object({ synced: z.int() }) },
      },
    },
    async (request) => ({
      synced: await billing.handleWebhook(deps, request.headers.authorization, request.body.event),
    }),
  );
};

export const billingRoutes: FastifyPluginAsyncZod<{ deps: Deps }> = async (app, { deps }) => {
  app.addHook("onRequest", createAuthenticateHook(deps));

  /** After a purchase or "Restore purchases": confirm with RevenueCat now. */
  app.post(
    "/families/:familyId/billing/refresh",
    { schema: { params: familyParamsSchema, response: { 200: planSchema } } },
    async (request) => billing.refreshPlan(deps, request.userId, request.params.familyId),
  );
};
