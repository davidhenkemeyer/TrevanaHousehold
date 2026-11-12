/**
 * A member's history, shaped for the domain's gamification rules: their
 * approved chores (for badges) and how each recent day went (for streaks).
 * Used when awarding badges at approval time and when showing progress.
 *
 * Streaks are computed from this every time, never stored.
 */
import {
  type ApprovalRecord,
  type BadgeHistory,
  type DayInstance,
  type DayOutcome,
  type PlainDate,
  type Streak,
  addDays,
  cleanWeeks,
  dayOutcome,
  instantToPlainDate,
  streakOf,
} from "@tenara/domain";
import { dbDateToPlain, plainToDbDate } from "../../lib/dates.js";
import type { DbOrTx } from "../instances/generate.js";

/** How far back streaks look. Long enough for the 30-day badge, with room for saves. */
export const STREAK_WINDOW_DAYS = 180;

export interface MemberHistory {
  badges: BadgeHistory;
  streak: Streak;
}

export async function memberHistory(
  db: DbOrTx,
  membershipId: string,
  timeZone: string,
  now: Date,
): Promise<MemberHistory> {
  const today = instantToPlainDate(now, timeZone);

  // Approved chores, oldest first.
  const approved = await db.choreInstance.findMany({
    where: { status: "APPROVED", assignees: { some: { membershipId } } },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    select: {
      board: true,
      chore: { select: { id: true, name: true } },
      submissions: { select: { reviews: { select: { action: true } } } },
    },
  });
  const approvals: ApprovalRecord[] = approved.map((i) => ({
    choreId: i.chore.id,
    choreName: i.chore.name,
    reworked: i.submissions.some((s) => s.reviews.some((r) => r.action === "REQUEST_REWORK")),
    fromJobBoard: i.board === "CLAIMED",
  }));

  // How each recent day went.
  const from = addDays(today, -STREAK_WINDOW_DAYS);
  const recent = await db.choreInstance.findMany({
    where: {
      assignees: { some: { membershipId } },
      occurrenceDate: { gte: plainToDbDate(from), lte: plainToDbDate(today) },
    },
    select: {
      occurrenceDate: true,
      status: true,
      dueAt: true,
      submissions: { orderBy: { submittedAt: "asc" }, take: 1, select: { submittedAt: true } },
    },
  });
  const byDate = new Map<PlainDate, DayInstance[]>();
  for (const i of recent) {
    const date = dbDateToPlain(i.occurrenceDate);
    let list = byDate.get(date);
    if (!list) byDate.set(date, (list = []));
    list.push({
      status: i.status,
      dueAt: i.dueAt,
      firstSubmittedAt: i.submissions[0]?.submittedAt ?? null,
    });
  }
  const days: { date: PlainDate; outcome: DayOutcome }[] = [...byDate.keys()]
    .sort()
    .map((date) => ({ date, outcome: dayOutcome(byDate.get(date) ?? [], now) }));
  const streak = streakOf(days.map((d) => d.outcome));

  return {
    badges: { approvals, bestStreak: streak.best, cleanWeeks: cleanWeeks(days, today) },
    streak,
  };
}
