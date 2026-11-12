/**
 * What the home-screen widget shows, as a small JSON snapshot the app writes
 * after each Today load. The widget never calls the API and never holds a
 * token: it only reads the last snapshot (iPhone: an App Group shared with the
 * widget; Android: the app's own storage, read by the widget task).
 *
 * Shows the person who last used the app on this device: their chores left
 * today and the next few, plus, for a parent, how many are waiting for review.
 * Widgets are Pro; on Basic the snapshot says so instead.
 */
import type { Instance } from "@tenara/contracts";
import { dueLabel } from "../today/sections";

export const WIDGET_SNAPSHOT_VERSION = 1;
/** How many upcoming chores the widget lists. */
export const WIDGET_NEXT_COUNT = 3;

export interface WidgetSnapshot {
  v: typeof WIDGET_SNAPSHOT_VERSION;
  /** First name of the person it's for. */
  name: string;
  /** True when the family's plan doesn't include widgets. */
  locked: boolean;
  /** Today's chores for this person that are done or handed in. */
  done: number;
  total: number;
  /** Still to do (including late and sent-back ones). */
  left: number;
  next: { name: string; when: string }[];
  /** Parents only: chores waiting for their review; null for kids. */
  waiting: number | null;
  updatedAt: string;
}

const LEFT = new Set(["NEW", "IN_PROGRESS", "DEFERRED", "NEEDS_REWORK"]);
const DONE = new Set(["PENDING_REVIEW", "APPROVED"]);

export function buildWidgetSnapshot(input: {
  items: readonly Instance[];
  viewerMembershipId: string;
  name: string;
  role: "PARENT" | "CHILD";
  widgetsAllowed: boolean;
  now: Date;
}): WidgetSnapshot {
  const mine = input.items.filter((i) =>
    i.assignees.some((a) => a.membershipId === input.viewerMembershipId),
  );
  const left = mine.filter((i) => LEFT.has(i.status));
  const done = mine.filter((i) => DONE.has(i.status));
  return {
    v: WIDGET_SNAPSHOT_VERSION,
    name: input.name.split(" ")[0] ?? input.name,
    locked: !input.widgetsAllowed,
    done: done.length,
    total: left.length + done.length,
    left: left.length,
    // Sent-back and late chores first, then the API's order.
    next: [...left]
      .sort((a, b) => urgency(b) - urgency(a))
      .slice(0, WIDGET_NEXT_COUNT)
      .map((i) => ({ name: i.choreName, when: dueLabel(i.dueAt, input.now) })),
    waiting:
      input.role === "PARENT"
        ? input.items.filter((i) => i.status === "PENDING_REVIEW").length
        : null,
    updatedAt: input.now.toISOString(),
  };
}

const urgency = (i: Instance) => (i.status === "NEEDS_REWORK" ? 2 : i.isLate ? 1 : 0);

/** The widget's words, shared by both platforms' layouts. */
export function widgetText(s: WidgetSnapshot): { title: string; subtitle: string } {
  if (s.locked) {
    return { title: "Tenara", subtitle: "Widgets are part of Tenara Pro." };
  }
  const title = s.left === 0 ? `All done, ${s.name}!` : `${s.name}: ${s.left} left today`;
  const parts = [s.total > 0 ? `${s.done} of ${s.total} done` : "Nothing due today"];
  if (s.waiting !== null && s.waiting > 0) parts.push(`${s.waiting} to review`);
  return { title, subtitle: parts.join(" · ") };
}

/** A snapshot read back from storage, or null if it's missing or from another version. */
export function parseWidgetSnapshot(raw: string | null | undefined): WidgetSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WidgetSnapshot>;
    return parsed.v === WIDGET_SNAPSHOT_VERSION ? (parsed as WidgetSnapshot) : null;
  } catch {
    return null;
  }
}
