/**
 * "Celebrate once": new badges and level-ups are celebrated the next time
 * the person opens Today, once per device. What's been celebrated is kept in
 * the device's storage; the first time (nothing stored yet), everything
 * already earned counts as seen, so a new device doesn't replay old news.
 */
import type { MemberProgress } from "@titan/contracts";

export interface Seen {
  level: number;
  badges: string[];
}

export interface News {
  /** The new level, if they went up since last time. */
  level?: number;
  /** Labels of badges earned since last time, oldest first. */
  badges: string[];
}

export function whatsNew(progress: MemberProgress, seen: Seen | null): News {
  if (seen === null) return { badges: [] };
  const known = new Set(seen.badges);
  return {
    ...(progress.level > seen.level && { level: progress.level }),
    badges: progress.badges
      .filter((b) => !known.has(b.key))
      .reverse() // the API lists newest first
      .map((b) => b.label),
  };
}

export function seenNow(progress: MemberProgress): Seen {
  return { level: progress.level, badges: progress.badges.map((b) => b.key) };
}

export function parseSeen(raw: string | null): Seen | null {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<Seen>;
    if (typeof value.level !== "number" || !Array.isArray(value.badges)) return null;
    return { level: value.level, badges: value.badges.filter((b) => typeof b === "string") };
  } catch {
    return null;
  }
}

export const seenKey = (membershipId: string) => `titan.progress.seen.${membershipId}`;

/** "Level 3 · 5-day streak" (or "Level 3" when there's no streak yet). */
export function levelLine(progress: Pick<MemberProgress, "level" | "streak">): string {
  const streak = progress.streak.days;
  return streak > 0 ? `Level ${progress.level} · ${streak}-day streak` : `Level ${progress.level}`;
}
