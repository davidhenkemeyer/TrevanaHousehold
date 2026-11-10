/**
 * Planning: turns a family's chores into dated, assigned ChoreInstances for
 * the next PLANNING_WINDOW_DAYS days. Safe to run any number of times: dates
 * that already have an instance are skipped (and the database's unique key on
 * (choreId, occurrenceDate) backs that up if two runs race).
 *
 * Called when chores are created or edited, by the "replan" endpoint, and
 * (from Step 4) by the nightly job.
 */
import { randomUUID } from "node:crypto";
import { recurrenceSchema, toRecurrenceRule, weeklyCapacitySchema } from "@chores/contracts";
import {
  type PlainDate,
  type PlanMember,
  type RecurrenceRule,
  type ScheduleChore,
  addDays,
  computeInstanceWindow,
  expandOccurrences,
  instantToPlainDate,
  minutesPerAssignee,
  occurrenceKey,
  planAssignments,
  planningWindow,
} from "@chores/domain";
import type { Db } from "../../db.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { dbDateToPlain, plainToDbDate } from "../../lib/dates.js";

export type DbOrTx = Db | Prisma.TransactionClient;

/** How far back to look for "who did this chore last" (rotation and tie-breaks). */
const HISTORY_DAYS = 60;

export async function familyToday(
  db: DbOrTx,
  familyId: string,
  now: Date,
): Promise<{ today: PlainDate; timeZone: string }> {
  const family = await db.family.findUniqueOrThrow({
    where: { id: familyId },
    select: { timeZone: true },
  });
  return { today: instantToPlainDate(now, family.timeZone), timeZone: family.timeZone };
}

/**
 * Deletes occurrences nobody has touched yet (still NEW, no status changes,
 * dated today or later) so they can be planned again from current settings.
 * Anything started, submitted, or reviewed is left alone.
 */
export async function removeUntouchedFuture(
  db: DbOrTx,
  familyId: string,
  today: PlainDate,
  choreId?: string,
): Promise<number> {
  const result = await db.choreInstance.deleteMany({
    where: {
      familyId,
      ...(choreId !== undefined && { choreId }),
      status: "NEW",
      occurrenceDate: { gte: plainToDbDate(today) },
      events: { none: {} },
    },
  });
  return result.count;
}

/**
 * Re-plans a family's untouched future occurrences from current chores,
 * members, and capacity. Used after anything that changes who should get what.
 */
export async function replanUntouched(
  db: DbOrTx,
  familyId: string,
  now: Date,
): Promise<{ created: number; removed: number }> {
  const { today } = await familyToday(db, familyId, now);
  const removed = await removeUntouchedFuture(db, familyId, today);
  const { created } = await planFamily(db, familyId, now);
  return { created, removed };
}

export interface PlanResult {
  created: number;
  /** Occurrence keys that couldn't be assigned (e.g. a FIXED chore whose owners all left). */
  unassigned: string[];
  /** Chores skipped because their stored recurrence is invalid. */
  invalidChoreIds: string[];
}

export async function planFamily(db: DbOrTx, familyId: string, now: Date): Promise<PlanResult> {
  const { today, timeZone } = await familyToday(db, familyId, now);
  const { from, to } = planningWindow(today);

  // Sequential on purpose: this usually runs inside a transaction, which has a
  // single connection, and parallel queries on one pg connection are deprecated.
  const chores = await db.chore.findMany({
    where: { familyId, active: true },
    include: { eligible: { orderBy: { position: "asc" } } },
  });
  const members = await db.membership.findMany({
    where: { familyId, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, capacity: true },
  });
  const windowInstances = await db.choreInstance.findMany({
    where: { familyId, occurrenceDate: { gte: plainToDbDate(from), lte: plainToDbDate(to) } },
    select: {
      choreId: true,
      occurrenceDate: true,
      effortMinutes: true,
      status: true,
      assignees: { select: { membershipId: true } },
    },
  });
  const history = await db.choreInstance.findMany({
    where: {
      familyId,
      status: { not: "CANCELED" },
      occurrenceDate: { gte: plainToDbDate(addDays(today, -HISTORY_DAYS)), lte: plainToDbDate(to) },
    },
    orderBy: { occurrenceDate: "asc" },
    select: { choreId: true, occurrenceDate: true, assignees: { select: { membershipId: true } } },
  });

  // Chores → planner input. A corrupt stored rule skips that chore rather than the family.
  const rules = new Map<string, RecurrenceRule>();
  const invalidChoreIds: string[] = [];
  const scheduleChores: ScheduleChore[] = [];
  for (const chore of chores) {
    const parsed = recurrenceSchema.safeParse(chore.recurrence);
    if (!parsed.success) {
      invalidChoreIds.push(chore.id);
      continue;
    }
    const rule = toRecurrenceRule(parsed.data);
    rules.set(chore.id, rule);
    scheduleChores.push({
      id: chore.id,
      recurrence: rule,
      effortMinutes: chore.effortMinutes,
      priority: chore.defaultPriority,
      mode: chore.assignMode,
      pool: chore.eligible.map((e) => e.membershipId),
    });
  }

  const planMembers: PlanMember[] = members.map((m) => ({
    id: m.id,
    weeklyCapacity: weeklyCapacitySchema.parse(m.capacity),
  }));

  // What's already planned: never plan a date twice; count its minutes as load.
  const existingKeys = new Set<string>();
  const existingLoad: Record<string, Record<string, number>> = {};
  for (const inst of windowInstances) {
    const date = dbDateToPlain(inst.occurrenceDate);
    existingKeys.add(occurrenceKey(inst.choreId, date));
    if (inst.status === "CANCELED" || inst.status === "REJECTED") continue;
    const minutes = minutesPerAssignee(inst.effortMinutes, inst.assignees.length);
    for (const { membershipId } of inst.assignees) {
      const day = (existingLoad[date] ??= {});
      day[membershipId] = (day[membershipId] ?? 0) + minutes;
    }
  }

  // Who had each chore last (rows are in date order, so later rows overwrite earlier).
  const lastRotationAssignee: Record<string, string> = {};
  const lastAssignedOn: Record<string, Record<string, string>> = {};
  for (const inst of history) {
    const date = dbDateToPlain(inst.occurrenceDate);
    const first = inst.assignees[0];
    if (first) lastRotationAssignee[inst.choreId] = first.membershipId;
    for (const { membershipId } of inst.assignees) {
      (lastAssignedOn[inst.choreId] ??= {})[membershipId] = date;
    }
  }

  const occurrences = expandOccurrences(scheduleChores, from, to, existingKeys);
  const plan = planAssignments({
    members: planMembers,
    occurrences,
    history: { existingLoad, lastRotationAssignee, lastAssignedOn },
  });

  const choresById = new Map(chores.map((c) => [c.id, c]));
  const occurrenceByKey = new Map(occurrences.map((o) => [o.key, o]));
  const instanceRows: Prisma.ChoreInstanceCreateManyInput[] = [];
  const assigneeRows: Prisma.InstanceAssigneeCreateManyInput[] = [];
  for (const assignment of plan.assignments) {
    const occ = occurrenceByKey.get(assignment.key);
    const chore = occ && choresById.get(occ.choreId);
    const rule = occ && rules.get(occ.choreId);
    if (!occ || !chore || !rule) continue;
    const window = computeInstanceWindow(occ.date, rule.timeOfDay, chore.deadlineMinutes, timeZone);
    const id = randomUUID();
    instanceRows.push({
      id,
      choreId: chore.id,
      familyId,
      occurrenceDate: plainToDbDate(occ.date),
      availableAt: window.availableAt,
      dueAt: window.dueAt,
      priority: chore.defaultPriority,
      rewardAmount: chore.rewardAmount,
      effortMinutes: chore.effortMinutes,
    });
    for (const membershipId of assignment.assigneeIds) {
      assigneeRows.push({ instanceId: id, membershipId });
    }
  }

  if (instanceRows.length > 0) {
    await db.choreInstance.createMany({ data: instanceRows, skipDuplicates: true });
    // A concurrent run may have inserted some of the same dates first: only
    // attach assignees to the rows this run actually created.
    const inserted = await db.choreInstance.findMany({
      where: { id: { in: instanceRows.map((r) => r.id as string) } },
      select: { id: true },
    });
    const insertedIds = new Set(inserted.map((r) => r.id));
    await db.instanceAssignee.createMany({
      data: assigneeRows.filter((r) => insertedIds.has(r.instanceId)),
    });
    return {
      created: insertedIds.size,
      unassigned: plan.unassigned.map((u) => u.key),
      invalidChoreIds,
    };
  }
  return { created: 0, unassigned: plan.unassigned.map((u) => u.key), invalidChoreIds };
}
