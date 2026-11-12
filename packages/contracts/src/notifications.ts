/**
 * Notifications: the in-app inbox, per-person settings, and registering a
 * phone for push. Pushes themselves are sent by the server's background jobs.
 */
import { DELIVERIES, NOTIFICATION_TYPES } from "@tenara/domain";
import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.js";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (00:00–23:59)");

export const notificationSchema = z.object({
  id: idSchema,
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string(),
  body: z.string(),
  /** What it's about, for opening it: a chore occurrence or a reward request. */
  instanceId: idSchema.nullable(),
  redemptionId: idSchema.nullable(),
  createdAt: isoDateTimeSchema,
  read: z.boolean(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const inboxQuerySchema = z.object({
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const inboxSchema = z.object({
  items: z.array(notificationSchema),
  unreadCount: z.int(),
  nextCursor: z.string().nullable(),
});
export type Inbox = z.infer<typeof inboxSchema>;

export const markReadBodySchema = z.strictObject({
  /** Omit to mark everything read. */
  ids: z.array(idSchema).max(100).optional(),
});
export type MarkReadBody = z.infer<typeof markReadBodySchema>;

const byTypeSchema = z.partialRecord(z.enum(NOTIFICATION_TYPES), z.enum(DELIVERIES));

export const notificationSettingsSchema = z.object({
  digestTime: timeSchema,
  quietStart: timeSchema,
  quietEnd: timeSchema,
  /** Every kind, with this person's choice (or its default). */
  byType: z.record(z.enum(NOTIFICATION_TYPES), z.enum(DELIVERIES)),
});
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const updateNotificationSettingsBodySchema = z.strictObject({
  digestTime: timeSchema.optional(),
  quietStart: timeSchema.optional(),
  quietEnd: timeSchema.optional(),
  /** Only the kinds being changed. */
  byType: byTypeSchema.optional(),
});
export type UpdateNotificationSettingsBody = z.infer<typeof updateNotificationSettingsBodySchema>;

export const registerDeviceBodySchema = z.strictObject({
  expoPushToken: z
    .string()
    .max(200)
    .regex(/^Expo(nent)?PushToken\[[^\]]+\]$/, "Not an Expo push token"),
  platform: z.enum(["ios", "android"]),
});
export type RegisterDeviceBody = z.infer<typeof registerDeviceBodySchema>;
export const deviceParamsSchema = z.object({ token: z.string().max(200) });
