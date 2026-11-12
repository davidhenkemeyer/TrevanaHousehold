/**
 * Turns the agenda into the Today view's sections. Pure logic, unit-tested.
 * Order within a section is the API's (effective priority, then due time).
 */
import type { Instance } from "@tenara/contracts";

export type SectionKey = "attention" | "todo" | "review" | "done";
export type Scope = "mine" | "family";

export interface TodaySection {
  key: SectionKey;
  title: string;
  items: Instance[];
}

const TITLES: Record<SectionKey, string> = {
  attention: "Needs attention",
  todo: "To do",
  review: "Waiting for review",
  done: "Done",
};

const OUTSTANDING = new Set(["NEW", "IN_PROGRESS", "DEFERRED"]);

export function sectionOf(item: Instance): SectionKey | null {
  if (item.status === "NEEDS_REWORK") return "attention";
  if (OUTSTANDING.has(item.status)) return item.isLate ? "attention" : "todo";
  if (item.status === "PENDING_REVIEW") return "review";
  if (item.status === "APPROVED") return "done";
  return null; // rejected or canceled: not shown on Today
}

export function buildSections(
  items: readonly Instance[],
  options: { viewerMembershipId: string; scope: Scope },
): TodaySection[] {
  const visible =
    options.scope === "mine"
      ? items.filter((i) => i.assignees.some((a) => a.membershipId === options.viewerMembershipId))
      : items;
  const buckets: Record<SectionKey, Instance[]> = { attention: [], todo: [], review: [], done: [] };
  for (const item of visible) {
    const key = sectionOf(item);
    if (key) buckets[key].push(item);
  }
  return (Object.keys(buckets) as SectionKey[])
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ key, title: TITLES[key], items: buckets[key] }));
}

/** Kids start on their own chores; parents on the whole family's. */
export function defaultScope(role: "PARENT" | "CHILD"): Scope {
  return role === "PARENT" ? "family" : "mine";
}

/**
 * Friendly due text. A deadline of exactly midnight means "by the end of the
 * day before", so it reads "Due today" rather than "Due Wed 12:00 AM".
 */
export function dueLabel(dueAtIso: string, now: Date = new Date()): string {
  const due = new Date(dueAtIso);
  const atMidnight = due.getHours() === 0 && due.getMinutes() === 0;
  const day = atMidnight ? new Date(due.getTime() - 60_000) : due;

  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysAway = Math.round((startOf(day) - startOf(now)) / 86_400_000);
  const dayName =
    daysAway === 0
      ? "today"
      : daysAway === 1
        ? "tomorrow"
        : daysAway === -1
          ? "yesterday"
          : day.toLocaleDateString([], { weekday: "short" });

  if (atMidnight) return `Due ${dayName}`;
  const time = due.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return daysAway === 0 ? `Due ${time}` : `Due ${dayName} ${time}`;
}

/** "Done 2 of 5" style progress for the header ring. */
export function dayProgress(sections: readonly TodaySection[]): { done: number; total: number } {
  const count = (keys: SectionKey[]) =>
    sections.filter((s) => keys.includes(s.key)).reduce((n, s) => n + s.items.length, 0);
  return { done: count(["review", "done"]), total: count(["attention", "todo", "review", "done"]) };
}
