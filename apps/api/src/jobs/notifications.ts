/**
 * Push delivery, run by background jobs (never inside a request):
 *
 *   sendInstantNotifications — every minute: notifications whose recipient
 *     wants that kind instantly, outside their quiet hours.
 *   sendDigests — every 15 minutes: one morning message per person once
 *     their local digest time has passed (default 7:30): today's chores,
 *     anything to try again, (parents) what's waiting for review and reward
 *     requests, and how many other updates arrived. Nothing on an empty day.
 *
 * Everything is in the inbox regardless; these only decide what's pushed.
 * Tokens Expo reports as no longer registered are deleted, at send time and
 * again from delivery receipts (checkPushReceipts).
 */
import {
  type NotificationType,
  digestDue,
  digestText,
  deliveryFor,
  inQuietHours,
  instantToPlainDate,
  instantToPlainTime,
  resolvePrefs,
} from "@tenara/domain";
import type { FastifyBaseLogger } from "fastify";
import type { Deps } from "../deps.js";
import type { PushMessage } from "../lib/push/types.js";
import { plainToDbDate } from "../lib/dates.js";

type JobDeps = Pick<Deps, "db" | "push" | "now">;

/** Instant notifications older than this are left to the digest instead. */
const INSTANT_MAX_AGE_MS = 12 * 60 * 60_000;

/** Sends to every device of each user, then forgets dead tokens. */
async function deliver(
  deps: JobDeps,
  messages: readonly (Omit<PushMessage, "to"> & { userId: string })[],
): Promise<number> {
  if (messages.length === 0) return 0;
  const devices = await deps.db.pushDevice.findMany({
    where: { userId: { in: [...new Set(messages.map((m) => m.userId))] } },
  });
  const out: PushMessage[] = messages.flatMap(({ userId, ...m }) =>
    devices.filter((d) => d.userId === userId).map((d) => ({ ...m, to: d.expoPushToken })),
  );
  if (out.length === 0) return 0;
  const results = await deps.push.send(out);
  const dead = results.filter((r) => r.unregistered).map((r) => r.to);
  if (dead.length > 0) {
    await deps.db.pushDevice.deleteMany({ where: { expoPushToken: { in: dead } } });
  }
  // Keep accepted tickets so checkPushReceipts can read their receipts later.
  const createdAt = deps.now();
  const tickets = results.flatMap((r) =>
    r.ok && r.ticketId ? [{ ticketId: r.ticketId, expoPushToken: r.to, createdAt }] : [],
  );
  if (tickets.length > 0) {
    await deps.db.pushTicket.createMany({ data: tickets, skipDuplicates: true });
  }
  return results.filter((r) => r.ok).length;
}

/** Expo has receipts ready about 15 minutes after a send... */
const RECEIPT_READY_MS = 15 * 60_000;
/** ...and keeps them for a day; older tickets are dropped unread. */
const RECEIPT_KEPT_MS = 24 * 60 * 60_000;
/** Tickets read per round (the Expo adapter splits requests further). */
const RECEIPT_BATCH = 1000;

/**
 * Every 15 minutes: reads delivery receipts for pushes sent at least 15
 * minutes ago and forgets tokens Apple or Google report as dead. A ticket is
 * deleted once its receipt is read, or after a day without one.
 */
export async function checkPushReceipts(
  deps: JobDeps,
  log: Pick<FastifyBaseLogger, "info">,
): Promise<{ checked: number; deadTokens: number }> {
  const now = deps.now().getTime();
  await deps.db.pushTicket.deleteMany({
    where: { createdAt: { lt: new Date(now - RECEIPT_KEPT_MS) } },
  });
  let checked = 0;
  let deadTokens = 0;
  let cursor: string | undefined;
  for (;;) {
    const tickets = await deps.db.pushTicket.findMany({
      where: {
        createdAt: { lte: new Date(now - RECEIPT_READY_MS) },
        ...(cursor !== undefined && { id: { gt: cursor } }),
      },
      orderBy: { id: "asc" },
      take: RECEIPT_BATCH,
    });
    if (tickets.length === 0) break;
    cursor = tickets.at(-1)?.id;
    const receipts = await deps.push.receipts(tickets.map((t) => t.ticketId));
    const read = tickets.filter((t) => receipts[t.ticketId] !== undefined);
    const dead = [
      ...new Set(
        read.filter((t) => receipts[t.ticketId]?.unregistered).map((t) => t.expoPushToken),
      ),
    ];
    if (dead.length > 0) {
      const removed = await deps.db.pushDevice.deleteMany({
        where: { expoPushToken: { in: dead } },
      });
      deadTokens += removed.count;
    }
    if (read.length > 0) {
      await deps.db.pushTicket.deleteMany({ where: { id: { in: read.map((t) => t.id) } } });
    }
    checked += read.length;
    if (tickets.length < RECEIPT_BATCH) break;
  }
  if (checked > 0) log.info({ checked, deadTokens }, "Checked push receipts");
  return { checked, deadTokens };
}

export async function sendInstantNotifications(
  deps: JobDeps,
  log: Pick<FastifyBaseLogger, "info">,
): Promise<number> {
  const now = deps.now();
  const waiting = await deps.db.notification.findMany({
    where: {
      pushedAt: null,
      digestedAt: null,
      createdAt: { gte: new Date(now.getTime() - INSTANT_MAX_AGE_MS) },
    },
    orderBy: { createdAt: "asc" },
    take: 500,
    include: {
      membership: {
        select: { userId: true, notificationPrefs: true, family: { select: { timeZone: true } } },
      },
    },
  });
  const ready = waiting.filter((n) => {
    const prefs = resolvePrefs(n.membership.notificationPrefs);
    return (
      deliveryFor(n.type as NotificationType, prefs) === "INSTANT" &&
      !inQuietHours(instantToPlainTime(now, n.membership.family.timeZone), prefs)
    );
  });
  if (ready.length === 0) return 0;

  // Mark first, so an error part-way can't send the same notification twice.
  await deps.db.notification.updateMany({
    where: { id: { in: ready.map((n) => n.id) }, pushedAt: null },
    data: { pushedAt: now },
  });
  const sent = await deliver(
    deps,
    ready.map((n) => ({
      userId: n.membership.userId,
      title: n.title,
      body: n.body,
      data: (n.data ?? {}) as Record<string, unknown>,
    })),
  );
  if (sent > 0) log.info({ sent }, "Sent instant notifications");
  return ready.length;
}

const OUTSTANDING = ["NEW", "IN_PROGRESS", "DEFERRED"] as const;

export async function sendDigests(
  deps: JobDeps,
  log: Pick<FastifyBaseLogger, "info">,
): Promise<number> {
  const now = deps.now();
  const members = await deps.db.membership.findMany({
    where: { active: true },
    select: {
      id: true,
      familyId: true,
      role: true,
      userId: true,
      notificationPrefs: true,
      lastDigestOn: true,
      user: { select: { displayName: true } },
      family: { select: { timeZone: true } },
    },
  });

  let digests = 0;
  const messages: { userId: string; title: string; body: string; data: Record<string, unknown> }[] =
    [];
  for (const m of members) {
    const prefs = resolvePrefs(m.notificationPrefs);
    const localDate = instantToPlainDate(now, m.family.timeZone);
    const localTime = instantToPlainTime(now, m.family.timeZone);
    const last = m.lastDigestOn ? m.lastDigestOn.toISOString().slice(0, 10) : null;
    if (!digestDue(localDate, localTime, prefs, last)) continue;

    // Claim today's digest first: a second job run can't send it twice.
    const claimed = await deps.db.membership.updateMany({
      where: {
        id: m.id,
        OR: [{ lastDigestOn: null }, { lastDigestOn: { lt: plainToDbDate(localDate) } }],
      },
      data: { lastDigestOn: plainToDbDate(localDate) },
    });
    if (claimed.count === 0) continue;
    digests++;

    const mine = { assignees: { some: { membershipId: m.id } }, board: { not: "OPEN" as const } };
    const today = plainToDbDate(localDate);
    const choresToday = await deps.db.choreInstance.count({
      where: { ...mine, status: { in: [...OUTSTANDING] }, occurrenceDate: { lte: today } },
    });
    const toTryAgain = await deps.db.choreInstance.count({
      where: { ...mine, status: "NEEDS_REWORK" },
    });
    const isParent = m.role === "PARENT";
    const waitingForReview = isParent
      ? await deps.db.choreInstance.count({
          where: { familyId: m.familyId, status: "PENDING_REVIEW" },
        })
      : 0;
    const rewardRequests = isParent
      ? await deps.db.redemption.count({ where: { familyId: m.familyId, status: "REQUESTED" } })
      : 0;

    // News since the last digest that wasn't pushed on its own.
    const news = await deps.db.notification.findMany({
      where: { membershipId: m.id, pushedAt: null, digestedAt: null },
      select: { id: true, type: true },
    });
    const updates = news.filter(
      (n) => deliveryFor(n.type as NotificationType, prefs) === "DIGEST",
    ).length;
    if (news.length > 0) {
      await deps.db.notification.updateMany({
        where: { id: { in: news.map((n) => n.id) } },
        data: { digestedAt: now },
      });
    }

    const text = digestText({
      name: m.user.displayName,
      choresToday,
      toTryAgain,
      waitingForReview,
      rewardRequests,
      updates,
    });
    if (text) messages.push({ userId: m.userId, ...text, data: { digest: true } });
  }

  const sent = await deliver(deps, messages);
  if (digests > 0) log.info({ digests, sent }, "Sent daily digests");
  return digests;
}
