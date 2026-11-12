/**
 * Notifications: which kinds there are, how each is delivered by default,
 * quiet hours, when the daily digest is due, and the words used.
 *
 * Product rules (branding doc and the family's choices):
 *   - The default is one daily digest (7:30 AM local time), not a stream of
 *     alerts. Only things someone is actively waiting on are instant by
 *     default: a chore sent back to try again (kid) and a reward request
 *     (parent).
 *   - Nothing is pushed in quiet hours (9 PM – 7 AM); instant ones wait.
 *   - Everyone can switch any kind to Instant, Digest, or Off.
 *   - Every notification also lands in the in-app inbox, whatever the delivery.
 *
 * The wording lives here so other clients (e.g. a voice assistant) say the
 * same thing.
 */
import { type PlainTime, isPlainTime } from "./timezone.js";

export const NOTIFICATION_TYPES = [
  "NEW_CHORE",
  "CHORE_LATE",
  "NEEDS_REWORK",
  "APPROVED",
  "REJECTED",
  "CANCELED",
  "REDEMPTION_DECIDED",
  "BADGE_EARNED",
  "SUBMITTED",
  "REDEMPTION_REQUESTED",
  "GOAL_REACHED",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const DELIVERIES = ["INSTANT", "DIGEST", "OFF"] as const;
export type Delivery = (typeof DELIVERIES)[number];

/** Who usually receives each kind (for grouping in settings). */
export const NOTIFICATION_INFO: Record<
  NotificationType,
  { audience: "assignee" | "parent" | "everyone"; delivery: Delivery; description: string }
> = {
  NEW_CHORE: {
    audience: "assignee",
    delivery: "DIGEST",
    description: "A new chore is added for you",
  },
  CHORE_LATE: {
    audience: "assignee",
    delivery: "DIGEST",
    description: "One of your chores is late",
  },
  NEEDS_REWORK: {
    audience: "assignee",
    delivery: "INSTANT",
    description: "Something is sent back to try again",
  },
  APPROVED: { audience: "assignee", delivery: "DIGEST", description: "Your chore is approved" },
  REJECTED: { audience: "assignee", delivery: "DIGEST", description: "Your chore isn't accepted" },
  CANCELED: {
    audience: "assignee",
    delivery: "DIGEST",
    description: "A chore of yours is canceled",
  },
  REDEMPTION_DECIDED: {
    audience: "assignee",
    delivery: "DIGEST",
    description: "A parent answers your reward request",
  },
  BADGE_EARNED: { audience: "assignee", delivery: "DIGEST", description: "You earn a badge" },
  SUBMITTED: { audience: "parent", delivery: "DIGEST", description: "Someone hands in a chore" },
  REDEMPTION_REQUESTED: {
    audience: "parent",
    delivery: "INSTANT",
    description: "Someone asks for a reward",
  },
  GOAL_REACHED: {
    audience: "everyone",
    delivery: "DIGEST",
    description: "The family goal is reached",
  },
};

export interface NotificationPrefs {
  /** Local time of the daily digest, "HH:MM". */
  digestTime: PlainTime;
  /** Quiet hours, "HH:MM" to "HH:MM" (may cross midnight). */
  quietStart: PlainTime;
  quietEnd: PlainTime;
  /** Per-kind choices; anything missing uses the kind's default. */
  byType: Partial<Record<NotificationType, Delivery>>;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  digestTime: "07:30",
  quietStart: "21:00",
  quietEnd: "07:00",
  byType: {},
};

/**
 * Stored preferences, made complete: anything missing or malformed falls
 * back to the default, so a bad stored value can never stop notifications.
 */
export function resolvePrefs(stored: unknown): NotificationPrefs {
  const raw = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  const time = (value: unknown, fallback: PlainTime) => (isPlainTime(value) ? value : fallback);
  const byType: Partial<Record<NotificationType, Delivery>> = {};
  const rawByType = (raw.byType && typeof raw.byType === "object" ? raw.byType : {}) as Record<
    string,
    unknown
  >;
  for (const type of NOTIFICATION_TYPES) {
    const value = rawByType[type];
    if (typeof value === "string" && (DELIVERIES as readonly string[]).includes(value)) {
      byType[type] = value as Delivery;
    }
  }
  return {
    digestTime: time(raw.digestTime, DEFAULT_NOTIFICATION_PREFS.digestTime),
    quietStart: time(raw.quietStart, DEFAULT_NOTIFICATION_PREFS.quietStart),
    quietEnd: time(raw.quietEnd, DEFAULT_NOTIFICATION_PREFS.quietEnd),
    byType,
  };
}

export function deliveryFor(type: NotificationType, prefs: NotificationPrefs): Delivery {
  return prefs.byType[type] ?? NOTIFICATION_INFO[type].delivery;
}

/** Whether a local time falls in quiet hours. Start == end means no quiet hours. */
export function inQuietHours(localTime: PlainTime, prefs: NotificationPrefs): boolean {
  const { quietStart: start, quietEnd: end } = prefs;
  if (start === end) return false;
  return start < end
    ? localTime >= start && localTime < end
    : localTime >= start || localTime < end; // crosses midnight
}

/** The digest is due once a day, at or after the chosen local time. */
export function digestDue(
  localDate: string,
  localTime: PlainTime,
  prefs: NotificationPrefs,
  lastDigestOn: string | null,
): boolean {
  return lastDigestOn !== localDate && localTime >= prefs.digestTime;
}

// Wording

export interface NotificationDetails {
  choreName?: string;
  /** Who did it ("Mom", "Billy"). */
  actorName?: string;
  note?: string | null;
  itemName?: string;
  /** e.g. "50 pts". */
  costText?: string;
  approved?: boolean;
  badgeLabel?: string;
  goalName?: string;
}

export function notificationText(
  type: NotificationType,
  d: NotificationDetails,
): { title: string; body: string } {
  const chore = d.choreName ?? "a chore";
  const actor = d.actorName ?? "A parent";
  switch (type) {
    case "NEW_CHORE":
      return { title: `New chore: ${chore}`, body: `${actor} added it for you.` };
    case "CHORE_LATE":
      return { title: `Late: ${chore}`, body: "It's past its deadline. You can still do it." };
    case "NEEDS_REWORK":
      return {
        title: `Try again: ${chore}`,
        body: d.note ? `${actor} says: ${d.note}` : `${actor} sent it back for another try.`,
      };
    case "APPROVED":
      return { title: `Approved: ${chore}`, body: "Nice work!" };
    case "REJECTED":
      return {
        title: `Not accepted: ${chore}`,
        body: d.note ? `${actor} says: ${d.note}` : `Talk to ${actor} about it.`,
      };
    case "CANCELED":
      return { title: `Canceled: ${chore}`, body: `${actor} took it off your list.` };
    case "REDEMPTION_DECIDED":
      return d.approved
        ? { title: `Yes! ${d.itemName ?? "Your reward"}`, body: `${actor} approved it.` }
        : {
            title: `Not now: ${d.itemName ?? "your reward"}`,
            body: d.note ? `${actor} says: ${d.note}` : "Your points are back.",
          };
    case "BADGE_EARNED":
      return { title: `New badge: ${d.badgeLabel ?? "a badge"}`, body: "Open the app to see it." };
    case "SUBMITTED":
      return { title: `${actor} handed in ${chore}`, body: "It's waiting for your review." };
    case "REDEMPTION_REQUESTED":
      return {
        title: `${actor} asks for ${d.itemName ?? "a reward"}`,
        body: `${d.costText ? `${d.costText}. ` : ""}Say yes or not now in Review.`,
      };
    case "GOAL_REACHED":
      return {
        title: `Goal reached: ${d.goalName ?? "the family goal"}!`,
        body: "The whole family did it together.",
      };
  }
}

export interface DigestSummary {
  name: string;
  /** Chores still to do today. */
  choresToday: number;
  /** Chores sent back to try again. */
  toTryAgain: number;
  /** Parents: chores waiting for their review. */
  waitingForReview: number;
  /** Parents: reward requests waiting. */
  rewardRequests: number;
  /** Other news since the last digest (approvals, badges, ...). */
  updates: number;
}

/** One morning message, or null when there's nothing to say (no push on an empty day). */
export function digestText(s: DigestSummary): { title: string; body: string } | null {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts = [
    s.choresToday > 0 ? `${plural(s.choresToday, "chore", "chores")} today` : "",
    s.toTryAgain > 0 ? `${s.toTryAgain} to try again` : "",
    s.waitingForReview > 0 ? `${s.waitingForReview} waiting for review` : "",
    s.rewardRequests > 0 ? plural(s.rewardRequests, "reward request", "reward requests") : "",
    s.updates > 0 ? plural(s.updates, "update", "updates") : "",
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return { title: `Good morning, ${s.name}!`, body: parts.join(" · ") };
}
