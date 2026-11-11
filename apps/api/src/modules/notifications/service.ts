/**
 * Notifications: writing them (`notify`), the inbox, settings, and devices.
 *
 * `notify` is the only way a notification is created. It writes inbox rows
 * in the caller's transaction and sends nothing: pushes go out from the
 * background jobs (jobs/notifications.ts), instantly or in the daily digest,
 * per each person's settings. The person who caused an event is never
 * notified about it.
 */
import type {
  Inbox,
  MarkReadBody,
  Notification as NotificationDto,
  NotificationSettings,
  RegisterDeviceBody,
  UpdateNotificationSettingsBody,
} from "@titan/contracts";
import {
  NOTIFICATION_TYPES,
  type NotificationDetails,
  type NotificationType,
  deliveryFor,
  notificationText,
  resolvePrefs,
} from "@titan/domain";
import { z } from "zod";
import type { Deps } from "../../deps.js";
import type { Notification, Prisma } from "../../generated/prisma/client.js";
import { decodeCursor, encodeCursor } from "../../lib/cursor.js";
import { requireMember } from "../access.js";

type DbOrTx = Deps["db"] | Prisma.TransactionClient;

export interface NotifyInput {
  familyId: string;
  /** Membership ids. */
  to: readonly string[];
  /** The person who caused it; never notified. */
  exclude?: string | undefined;
  type: NotificationType;
  details: NotificationDetails;
  data?: { instanceId?: string; redemptionId?: string };
}

export async function notify(tx: DbOrTx, now: Date, input: NotifyInput): Promise<void> {
  const recipients = [...new Set(input.to)].filter((id) => id !== input.exclude);
  if (recipients.length === 0) return;
  const { title, body } = notificationText(input.type, input.details);
  await tx.notification.createMany({
    data: recipients.map((membershipId) => ({
      familyId: input.familyId,
      membershipId,
      type: input.type,
      title,
      body,
      ...(input.data && { data: input.data }),
      createdAt: now,
    })),
  });
}

/** The family's active parents' membership ids. */
export async function parentsOf(tx: DbOrTx, familyId: string): Promise<string[]> {
  const parents = await tx.membership.findMany({
    where: { familyId, role: "PARENT", active: true },
    select: { id: true },
  });
  return parents.map((p) => p.id);
}

/** Everyone active in the family. */
export async function everyoneIn(tx: DbOrTx, familyId: string): Promise<string[]> {
  const members = await tx.membership.findMany({
    where: { familyId, active: true },
    select: { id: true },
  });
  return members.map((m) => m.id);
}

export async function displayNameOf(tx: DbOrTx, membershipId: string): Promise<string> {
  const m = await tx.membership.findUnique({
    where: { id: membershipId },
    select: { user: { select: { displayName: true } } },
  });
  return m?.user.displayName ?? "Someone";
}

// The inbox

const dataSchema = z
  .object({ instanceId: z.string().optional(), redemptionId: z.string().optional() })
  .catch({});

function toDto(row: Notification): NotificationDto {
  const data = dataSchema.parse(row.data ?? {});
  return {
    id: row.id,
    type: (NOTIFICATION_TYPES as readonly string[]).includes(row.type)
      ? (row.type as NotificationType)
      : "APPROVED",
    title: row.title,
    body: row.body,
    instanceId: data.instanceId ?? null,
    redemptionId: data.redemptionId ?? null,
    createdAt: row.createdAt.toISOString(),
    read: row.readAt !== null,
  };
}

const cursorSchema = z.object({ t: z.string(), id: z.string() });

export async function getInbox(
  deps: Deps,
  userId: string,
  familyId: string,
  query: { cursor?: string | undefined; limit: number },
): Promise<Inbox> {
  const member = await requireMember(deps.db, familyId, userId);
  const after = decodeCursor(query.cursor, cursorSchema);
  const rows = await deps.db.notification.findMany({
    where: {
      membershipId: member.id,
      ...(after && {
        OR: [
          { createdAt: { lt: new Date(after.t) } },
          { createdAt: new Date(after.t), id: { lt: after.id } },
        ],
      }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
  });
  const unreadCount = await deps.db.notification.count({
    where: { membershipId: member.id, readAt: null },
  });
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: page.map(toDto),
    unreadCount,
    nextCursor:
      rows.length > query.limit && last
        ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id })
        : null,
  };
}

export async function markRead(
  deps: Deps,
  userId: string,
  familyId: string,
  body: MarkReadBody,
): Promise<void> {
  const member = await requireMember(deps.db, familyId, userId);
  await deps.db.notification.updateMany({
    where: {
      membershipId: member.id, // only your own
      readAt: null,
      ...(body.ids !== undefined && { id: { in: body.ids } }),
    },
    data: { readAt: deps.now() },
  });
}

// Settings

function toSettings(stored: unknown): NotificationSettings {
  const prefs = resolvePrefs(stored);
  return {
    digestTime: prefs.digestTime,
    quietStart: prefs.quietStart,
    quietEnd: prefs.quietEnd,
    byType: Object.fromEntries(
      NOTIFICATION_TYPES.map((type) => [type, deliveryFor(type, prefs)]),
    ) as NotificationSettings["byType"],
  };
}

export async function getSettings(
  deps: Deps,
  userId: string,
  familyId: string,
): Promise<NotificationSettings> {
  const member = await requireMember(deps.db, familyId, userId);
  return toSettings(member.notificationPrefs);
}

export async function updateSettings(
  deps: Deps,
  userId: string,
  familyId: string,
  body: UpdateNotificationSettingsBody,
): Promise<NotificationSettings> {
  const member = await requireMember(deps.db, familyId, userId);
  const current = resolvePrefs(member.notificationPrefs);
  const next = {
    digestTime: body.digestTime ?? current.digestTime,
    quietStart: body.quietStart ?? current.quietStart,
    quietEnd: body.quietEnd ?? current.quietEnd,
    byType: { ...current.byType, ...body.byType },
  };
  await deps.db.membership.update({ where: { id: member.id }, data: { notificationPrefs: next } });
  return toSettings(next);
}

// Devices (per signed-in user, not per family)

export async function registerDevice(
  deps: Deps,
  userId: string,
  body: RegisterDeviceBody,
): Promise<void> {
  // A token belongs to one phone; if someone else signs in on it, it moves to them.
  await deps.db.pushDevice.upsert({
    where: { expoPushToken: body.expoPushToken },
    create: {
      userId,
      expoPushToken: body.expoPushToken,
      platform: body.platform,
      lastSeenAt: deps.now(),
    },
    update: { userId, platform: body.platform, lastSeenAt: deps.now() },
  });
}

export async function unregisterDevice(deps: Deps, userId: string, token: string): Promise<void> {
  await deps.db.pushDevice.deleteMany({ where: { expoPushToken: token, userId } });
}
