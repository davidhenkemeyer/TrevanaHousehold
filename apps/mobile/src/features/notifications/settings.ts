/**
 * Notification settings and inbox helpers: which kinds each person sees in
 * settings, how they're described, and where tapping a notification goes.
 */
import type { Notification } from "@tenara/contracts";
import {
  NOTIFICATION_INFO,
  NOTIFICATION_TYPES,
  type NotificationType,
  type Role,
} from "@tenara/domain";

/** Kinds that matter to this person: kids don't review chores or approve rewards. */
export function typesFor(role: Role): NotificationType[] {
  return NOTIFICATION_TYPES.filter(
    (type) => role === "PARENT" || NOTIFICATION_INFO[type].audience !== "parent",
  );
}

/** "When something is sent back to try again". */
export function describeType(type: NotificationType): string {
  return `When ${lowerFirst(NOTIFICATION_INFO[type].description)}`;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Where tapping a notification (in the inbox or as a push) should go. */
export function targetOf(
  n: Pick<Notification, "type" | "instanceId" | "redemptionId">,
): { pathname: "/chore/[id]"; params: { id: string } } | "/review" | "/rewards" | "/pro" | null {
  if (n.instanceId) return { pathname: "/chore/[id]", params: { id: n.instanceId } };
  if (n.type === "REDEMPTION_REQUESTED") return "/review";
  if (n.type === "REDEMPTION_DECIDED" || n.type === "BADGE_EARNED" || n.type === "GOAL_REACHED") {
    return "/rewards";
  }
  if (n.type === "TRIAL_ENDING") return "/pro";
  return null;
}

/** "Tue 4:12 PM", or "4:12 PM" for today. */
export function whenLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === now.toDateString();
  return date.toLocaleString([], {
    ...(sameDay ? {} : { weekday: "short" }),
    hour: "numeric",
    minute: "2-digit",
  });
}
