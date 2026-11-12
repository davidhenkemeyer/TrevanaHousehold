/**
 * Gamification: XP, levels, streaks, badges, and the shared family goal.
 *
 * Product rules (branding doc and the family's choices):
 *   - Everyone earns XP, parents included, and everyone's XP fills the
 *     family goal. There is no leaderboard comparing people.
 *   - Nothing is ever taken away: XP is never deducted, badges are never
 *     removed, and streaks are computed from history (never stored), so no
 *     action can "wipe" one.
 *   - A streak day counts when everything assigned to the person that day was
 *     handed in by its deadline. Days with nothing assigned neither count nor
 *     break it, and today never breaks it.
 *   - Every 7 days in a row earns a "save" (preserver), up to 2. A missed day
 *     uses one automatically instead of ending the streak.
 */
import { type PlainDate, startOfWeekMonday } from "./calendar.js";
import type { ChoreStatus } from "./status.js";

// XP and levels

export const MIN_XP = 5;
export const MAX_XP_OVERRIDE = 500;

/** XP for approving a chore: the chore's override, else 1 per minute of effort (at least 5). */
export function xpFor(effortMinutes: number, override?: number | null): number {
  if (override !== undefined && override !== null) return override;
  return Math.max(MIN_XP, effortMinutes);
}

/** Total XP needed to reach `level` (level 1 needs none): 25 × L × (L − 1). */
export function xpToReach(level: number): number {
  return 25 * level * (level - 1);
}

export interface LevelInfo {
  level: number;
  /** XP earned since reaching this level. */
  xpIntoLevel: number;
  /** XP between this level and the next. */
  xpForNextLevel: number;
}

/** A gentle curve: level 2 at 50 XP, 3 at 150, 5 at 500, 10 at 2,250. */
export function levelFor(totalXp: number): LevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (xp >= xpToReach(level + 1)) level++;
  return {
    level,
    xpIntoLevel: xp - xpToReach(level),
    xpForNextLevel: xpToReach(level + 1) - xpToReach(level),
  };
}

// Streaks

export const STREAK_SAVE_EVERY = 7;
export const MAX_STREAK_SAVES = 2;

/**
 * How a day went for one person:
 *   DONE    — everything assigned was handed in on time
 *   MISSED  — something wasn't (or was rejected)
 *   NONE    — nothing was assigned
 *   PENDING — something can still be handed in (its deadline hasn't passed)
 */
export type DayOutcome = "DONE" | "MISSED" | "NONE" | "PENDING";

export interface DayInstance {
  status: ChoreStatus;
  dueAt: Date;
  /** When it was first handed in; null if never. */
  firstSubmittedAt: Date | null;
}

export function dayOutcome(instances: readonly DayInstance[], now: Date): DayOutcome {
  const counted = instances.filter((i) => i.status !== "CANCELED");
  if (counted.length === 0) return "NONE";
  let pending = false;
  for (const instance of counted) {
    const onTime =
      instance.firstSubmittedAt !== null &&
      instance.firstSubmittedAt.getTime() <= instance.dueAt.getTime() &&
      instance.status !== "REJECTED"; // rejected work wasn't really done
    if (onTime) continue;
    const stillOpen = instance.status !== "REJECTED" && now.getTime() <= instance.dueAt.getTime();
    if (stillOpen) pending = true;
    else return "MISSED";
  }
  return pending ? "PENDING" : "DONE";
}

export interface Streak {
  /** Days in the current streak. */
  days: number;
  /** Saves held (each covers one missed day). */
  saves: number;
  /** The longest streak ever. */
  best: number;
}

/** Walks day outcomes, oldest first. */
export function streakOf(outcomes: readonly DayOutcome[]): Streak {
  let days = 0;
  let saves = 0;
  let best = 0;
  let towardSave = 0;
  for (const outcome of outcomes) {
    if (outcome === "DONE") {
      days++;
      best = Math.max(best, days);
      towardSave++;
      if (towardSave === STREAK_SAVE_EVERY) {
        towardSave = 0;
        saves = Math.min(MAX_STREAK_SAVES, saves + 1);
      }
    } else if (outcome === "MISSED") {
      if (saves > 0) {
        saves--;
      } else {
        days = 0;
        towardSave = 0;
      }
    }
  }
  return { days, saves, best };
}

/**
 * Monday–Sunday weeks that are over, had at least one day of chores, and
 * every such day was DONE. `days` must be in date order.
 */
export function cleanWeeks(
  days: readonly { date: PlainDate; outcome: DayOutcome }[],
  today: PlainDate,
): number {
  const weeks = new Map<string, DayOutcome[]>();
  for (const day of days) {
    const week = startOfWeekMonday(day.date);
    let list = weeks.get(week);
    if (!list) weeks.set(week, (list = []));
    list.push(day.outcome);
  }
  const currentWeek = startOfWeekMonday(today);
  let count = 0;
  for (const [week, outcomes] of weeks) {
    if (week >= currentWeek) continue; // not over yet
    if (outcomes.includes("DONE") && outcomes.every((o) => o === "DONE" || o === "NONE")) count++;
  }
  return count;
}

// Badges

export interface ApprovalRecord {
  choreId: string;
  choreName: string;
  /** It was sent back for another try at least once. */
  reworked: boolean;
  /** It was taken from the job board. */
  fromJobBoard: boolean;
}

export interface BadgeHistory {
  /** Approved chores, oldest first. */
  approvals: readonly ApprovalRecord[];
  bestStreak: number;
  cleanWeeks: number;
}

export interface BadgeDefinition {
  key: string;
  label: string;
  description: string;
  /** A name the app maps to an icon. */
  icon: "star" | "trophy" | "flame" | "calendar" | "target" | "medal" | "hand";
}

export interface EarnedBadge {
  key: string;
  label: string;
  /** For per-chore badges (mastery). */
  choreId?: string;
}

export const MASTERY_COUNT = 10;
const MASTERY_PREFIX = "MASTERY:";

/** The badges anyone can earn, in display order. Mastery is one per chore (see below). */
export const BADGES: readonly (BadgeDefinition & { earned: (h: BadgeHistory) => boolean })[] = [
  {
    key: "FIRST_CHORE",
    label: "First chore",
    description: "Get a chore approved.",
    icon: "star",
    earned: (h) => h.approvals.length >= 1,
  },
  {
    key: "TEN_CHORES",
    label: "10 chores",
    description: "Get 10 chores approved.",
    icon: "medal",
    earned: (h) => h.approvals.length >= 10,
  },
  {
    key: "FIFTY_CHORES",
    label: "50 chores",
    description: "Get 50 chores approved.",
    icon: "medal",
    earned: (h) => h.approvals.length >= 50,
  },
  {
    key: "HUNDRED_CHORES",
    label: "100 chores",
    description: "Get 100 chores approved.",
    icon: "trophy",
    earned: (h) => h.approvals.length >= 100,
  },
  {
    key: "STREAK_7",
    label: "7-day streak",
    description: "Hand in everything on time, 7 days in a row.",
    icon: "flame",
    earned: (h) => h.bestStreak >= 7,
  },
  {
    key: "STREAK_30",
    label: "30-day streak",
    description: "Hand in everything on time, 30 days in a row.",
    icon: "flame",
    earned: (h) => h.bestStreak >= 30,
  },
  {
    key: "CLEAN_WEEK",
    label: "Clean week",
    description: "A whole week with every chore handed in on time.",
    icon: "calendar",
    earned: (h) => h.cleanWeeks >= 1,
  },
  {
    key: "RIGHT_FIRST_TIME",
    label: "Right first time",
    description: "10 approvals in a row without a redo.",
    icon: "target",
    earned: (h) => longestRun(h.approvals, (a) => !a.reworked) >= 10,
  },
  {
    key: "HELPER",
    label: "Helper",
    description: "Take a job from the job board and finish it.",
    icon: "hand",
    earned: (h) => h.approvals.some((a) => a.fromJobBoard),
  },
];

/** Shown in the badge grid for the per-chore mastery badges. */
export const MASTERY_BADGE: BadgeDefinition = {
  key: MASTERY_PREFIX,
  label: "Chore master",
  description: `Do the same chore ${MASTERY_COUNT} times without a redo.`,
  icon: "trophy",
};

export function masteryKey(choreId: string): string {
  return `${MASTERY_PREFIX}${choreId}`;
}

export function isMasteryKey(key: string): boolean {
  return key.startsWith(MASTERY_PREFIX);
}

function longestRun<T>(items: readonly T[], keep: (item: T) => boolean): number {
  let run = 0;
  let longest = 0;
  for (const item of items) {
    run = keep(item) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest;
}

/** Every badge the history has earned. Callers store the ones not yet awarded. */
export function earnedBadges(history: BadgeHistory): EarnedBadge[] {
  const earned: EarnedBadge[] = BADGES.filter((b) => b.earned(history)).map((b) => ({
    key: b.key,
    label: b.label,
  }));
  // Mastery: the same chore approved MASTERY_COUNT times without rework.
  const cleanByChore = new Map<string, { name: string; count: number }>();
  for (const approval of history.approvals) {
    if (approval.reworked) continue;
    const entry = cleanByChore.get(approval.choreId) ?? { name: approval.choreName, count: 0 };
    entry.count++;
    entry.name = approval.choreName; // the latest name
    cleanByChore.set(approval.choreId, entry);
  }
  for (const [choreId, { name, count }] of cleanByChore) {
    if (count >= MASTERY_COUNT) {
      earned.push({ key: masteryKey(choreId), label: `${name} master`, choreId });
    }
  }
  return earned;
}

// The shared family goal

export const MAX_GOAL_XP = 1_000_000;

export function goalProgress(
  totalXp: number,
  targetXp: number,
): { percent: number; reached: boolean } {
  if (targetXp <= 0) return { percent: 100, reached: true };
  return {
    percent: Math.min(100, Math.floor((Math.max(0, totalXp) * 100) / targetXp)),
    reached: totalXp >= targetXp,
  };
}
