import {
  deviceParamsSchema,
  familyParamsSchema,
  inboxQuerySchema,
  inboxSchema,
  markReadBodySchema,
  notificationSettingsSchema,
  registerDeviceBodySchema,
  updateNotificationSettingsBodySchema,
} from "@tenara/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Deps } from "../../deps.js";
import { createAuthenticateHook } from "../../plugins/authenticate.js";
import * as notifications from "./service.js";

export const notificationRoutes: FastifyPluginAsyncZod<{ deps: Deps }> = async (app, { deps }) => {
  app.addHook("onRequest", createAuthenticateHook(deps));

  app.get(
    "/families/:familyId/notifications",
    {
      schema: {
        params: familyParamsSchema,
        querystring: inboxQuerySchema,
        response: { 200: inboxSchema },
      },
    },
    async (request) =>
      notifications.getInbox(deps, request.userId, request.params.familyId, request.query),
  );

  app.post(
    "/families/:familyId/notifications/read",
    {
      schema: { params: familyParamsSchema, body: markReadBodySchema, response: { 204: z.null() } },
    },
    async (request, reply) => {
      await notifications.markRead(deps, request.userId, request.params.familyId, request.body);
      return reply.status(204).send(null);
    },
  );

  app.get(
    "/families/:familyId/notification-settings",
    { schema: { params: familyParamsSchema, response: { 200: notificationSettingsSchema } } },
    async (request) => notifications.getSettings(deps, request.userId, request.params.familyId),
  );

  app.patch(
    "/families/:familyId/notification-settings",
    {
      schema: {
        params: familyParamsSchema,
        body: updateNotificationSettingsBodySchema,
        response: { 200: notificationSettingsSchema },
      },
    },
    async (request) =>
      notifications.updateSettings(deps, request.userId, request.params.familyId, request.body),
  );

  app.post(
    "/me/devices",
    { schema: { body: registerDeviceBodySchema, response: { 204: z.null() } } },
    async (request, reply) => {
      await notifications.registerDevice(deps, request.userId, request.body);
      return reply.status(204).send(null);
    },
  );

  app.delete(
    "/me/devices/:token",
    { schema: { params: deviceParamsSchema, response: { 204: z.null() } } },
    async (request, reply) => {
      await notifications.unregisterDevice(deps, request.userId, request.params.token);
      return reply.status(204).send(null);
    },
  );
};
