import type {
  AgendaResponse,
  Instance,
  InstanceActionBody,
  InstanceDetail,
  InstanceList,
  ReplanResponse,
  SubmitBody,
  SubmitResponse,
  WeekLoad,
} from "@tenara/contracts";
import { weeklyCapacitySchema } from "@tenara/contracts";
import {
  type ChoreStatus,
  type PlainDate,
  addDays,
  daysBetween,
  historyStart,
  instantToPlainDate,
  maxDate,
  priorityRank,
  summarizeDayLoad,
} from "@tenara/domain";
import { z } from "zod";
import type { Deps } from "../../deps.js";
import { badRequest, notFound } from "../../errors.js";
import type { Membership, Prisma } from "../../generated/prisma/client.js";
import { decodeCursor, encodeCursor } from "../../lib/cursor.js";
import { dbDateToPlain, plainToDbDate } from "../../lib/dates.js";
import { requireMember, requireParent } from "../access.js";
import { type DbOrTx, familyToday, replanUntouched } from "./generate.js";
import { transition } from "./transitions.js";
import { checkUploads, claimUploads } from "../uploads/service.js";
import {
  type SignPhoto,
  type Viewer,
  detailExtras,
  instanceInclude,
  photoSigner,
  submissionInclude,
  toInstanceDetailDto,
  toInstanceDto,
  toSubmissionDto,
} from "./views.js";
import { loadPlan } from "../plans/service.js";

/** Not finished yet: shown on the Today view even if dated earlier. */
const OUTSTANDING: ChoreStatus[] = [
  "NEW",
  "IN_PROGRESS",
  "DEFERRED",
  "NEEDS_REWORK",
  "PENDING_REVIEW",
];
const MAX_LIST_RANGE_DAYS = 62;

const viewerOf = (m: Membership, now: Date): Viewer => ({
  membershipId: m.id,
  role: m.role,
  now,
});

const assignedTo = (memberId: string | undefined): Prisma.ChoreInstanceWhereInput =>
  memberId === undefined ? {} : { assignees: { some: { membershipId: memberId } } };

export async function loadInstance(
  db: DbOrTx,
  familyId: string,
  instanceId: string,
  viewer: Viewer,
  sign: SignPhoto,
): Promise<Instance> {
  const row = await db.choreInstance.findFirst({
    where: { id: instanceId, familyId },
    include: instanceInclude,
  });
  if (!row) throw notFound("INSTANCE_NOT_FOUND", "Chore not found.");
  return toInstanceDto(row, viewer, sign);
}

/** The Today view: the date's chores plus anything still outstanding from earlier days. */
export async function getAgenda(
  deps: Deps,
  userId: string,
  familyId: string,
  query: { date?: string | undefined; memberId?: string | undefined },
): Promise<AgendaResponse> {
  const member = await requireMember(deps.db, familyId, userId);
  const date =
    (query.date as PlainDate | undefined) ??
    (await familyToday(deps.db, familyId, deps.now())).today;
  const day = plainToDbDate(date);

  const rows = await deps.db.choreInstance.findMany({
    where: {
      familyId,
      ...assignedTo(query.memberId),
      // Unclaimed job-board jobs aren't anyone's chores yet; they're on the job board.
      board: { not: "OPEN" },
      OR: [{ occurrenceDate: day }, { occurrenceDate: { lt: day }, status: { in: OUTSTANDING } }],
    },
    include: instanceInclude,
  });
  const viewer = viewerOf(member, deps.now());
  const sign = photoSigner(deps);
  const items = (await Promise.all(rows.map((row) => toInstanceDto(row, viewer, sign)))).sort(
    (a, b) =>
      priorityRank(b.priority) - priorityRank(a.priority) ||
      a.dueAt.localeCompare(b.dueAt) ||
      a.choreName.localeCompare(b.choreName),
  );
  return { date, items };
}

const listCursorSchema = z.object({ d: z.string(), id: z.string() });

export async function listInstances(
  deps: Deps,
  userId: string,
  familyId: string,
  query: {
    from: string;
    to: string;
    memberId?: string | undefined;
    status?: ChoreStatus | undefined;
    cursor?: string | undefined;
    limit: number;
  },
): Promise<InstanceList> {
  const member = await requireMember(deps.db, familyId, userId);
  const from = query.from as PlainDate;
  const to = query.to as PlainDate;
  if (daysBetween(from, to) < 0)
    throw badRequest("INVALID_RANGE", "`from` must not be after `to`.");
  if (daysBetween(from, to) > MAX_LIST_RANGE_DAYS) {
    throw badRequest("RANGE_TOO_LARGE", `Ask for at most ${MAX_LIST_RANGE_DAYS} days at a time.`);
  }
  const after = decodeCursor(query.cursor, listCursorSchema);
  // Basic keeps 30 days of history; anything earlier is simply not listed.
  const start = historyStart(await loadPlan(deps.db, familyId, deps.now()), deps.now());
  let first = from;
  if (start) {
    const { timeZone } = await familyToday(deps.db, familyId, deps.now());
    first = maxDate(from, instantToPlainDate(start, timeZone));
  }

  const rows = await deps.db.choreInstance.findMany({
    where: {
      familyId,
      ...assignedTo(query.memberId),
      ...(query.status !== undefined && { status: query.status }),
      occurrenceDate: { gte: plainToDbDate(first), lte: plainToDbDate(to) },
      ...(after && {
        OR: [
          { occurrenceDate: { gt: new Date(after.d) } },
          { occurrenceDate: new Date(after.d), id: { gt: after.id } },
        ],
      }),
    },
    orderBy: [{ occurrenceDate: "asc" }, { id: "asc" }],
    take: query.limit + 1,
    include: instanceInclude,
  });
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  const viewer = viewerOf(member, deps.now());
  return {
    items: await Promise.all(page.map((row) => toInstanceDto(row, viewer, photoSigner(deps)))),
    nextCursor:
      rows.length > query.limit && last
        ? encodeCursor({ d: last.occurrenceDate.toISOString(), id: last.id })
        : null,
  };
}

export async function getInstanceDetail(
  deps: Deps,
  userId: string,
  familyId: string,
  instanceId: string,
): Promise<InstanceDetail> {
  const member = await requireMember(deps.db, familyId, userId);
  const where = { id: instanceId, familyId };
  const [row, history] = await Promise.all([
    deps.db.choreInstance.findFirst({ where, include: instanceInclude }),
    deps.db.choreInstance.findFirst({ where, include: detailExtras }),
  ]);
  if (!row || !history) throw notFound("INSTANCE_NOT_FOUND", "Chore not found.");
  return toInstanceDetailDto(row, history, viewerOf(member, deps.now()), photoSigner(deps));
}

/** start / defer / reset / cancel. */
export async function actOnInstance(
  deps: Deps,
  userId: string,
  familyId: string,
  instanceId: string,
  body: InstanceActionBody,
): Promise<Instance> {
  const member = await requireMember(deps.db, familyId, userId);
  return deps.db.$transaction(async (tx) => {
    await transition(tx, {
      familyId,
      instanceId,
      action: body.action,
      actor: member,
      now: deps.now(),
    });
    return loadInstance(tx, familyId, instanceId, viewerOf(member, deps.now()), photoSigner(deps));
  });
}

/**
 * "Done!": records a Submission and applies the complete action. A parent's
 * completion, or one under an AUTO_APPROVE policy, is approved on the spot
 * and gets an automatic APPROVE review so the history reads naturally.
 */
export async function submitInstance(
  deps: Deps,
  userId: string,
  familyId: string,
  instanceId: string,
  body: SubmitBody,
): Promise<SubmitResponse> {
  const member = await requireMember(deps.db, familyId, userId);
  const now = deps.now();
  // Storage checks happen before the transaction; claiming happens inside it.
  const photos = await checkUploads(deps, {
    familyId,
    member,
    purpose: "SUBMISSION",
    uploadIds: body.photoUploadIds,
  });
  return deps.db.$transaction(async (tx) => {
    const instance = await tx.choreInstance.findFirst({
      where: { id: instanceId, familyId },
      include: { chore: { include: { checklist: { orderBy: { position: "asc" } } } } },
    });
    if (!instance) throw notFound("INSTANCE_NOT_FOUND", "Chore not found.");

    const checked = new Map(body.checklist.map((i) => [i.itemId, i.checked]));
    const known = new Set(instance.chore.checklist.map((i) => i.id));
    const unknown = [...checked.keys()].filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw badRequest(
        "UNKNOWN_CHECKLIST_ITEM",
        "The checklist changed since this screen loaded. Refresh and try again.",
      );
    }

    const { result } = await transition(tx, {
      familyId,
      instanceId,
      action: "complete",
      actor: member,
      hasPhoto: photos.length > 0,
      now,
    });
    await claimUploads(tx, photos, now);

    const submission = await tx.submission.create({
      data: {
        instanceId,
        submittedById: member.id,
        submittedAt: now,
        checklistState: instance.chore.checklist.map((item) => ({
          itemId: item.id,
          text: item.text,
          checked: checked.get(item.id) ?? false,
        })),
        photoKeys: photos.map((p) => p.key),
      },
    });
    if (result.status === "APPROVED") {
      await tx.review.create({
        data: {
          submissionId: submission.id,
          // A parent approving their own completion is recorded as them; AUTO_APPROVE as nobody.
          reviewerId: member.role === "PARENT" ? member.id : null,
          action: "APPROVE",
          createdAt: now,
        },
      });
    }

    const fullSubmission = await tx.submission.findUniqueOrThrow({
      where: { id: submission.id },
      include: submissionInclude,
    });
    const sign = photoSigner(deps);
    return {
      instance: await loadInstance(tx, familyId, instanceId, viewerOf(member, deps.now()), sign),
      submission: await toSubmissionDto(fullSubmission, sign),
    };
  });
}

/** Re-plans every untouched future occurrence from current chores and capacity. */
export async function replanFamily(
  deps: Deps,
  userId: string,
  familyId: string,
): Promise<ReplanResponse> {
  await requireParent(deps.db, familyId, userId);
  return deps.db.$transaction((tx) => replanUntouched(tx, familyId, deps.now()));
}

/**
 * The parents' week view: for each day from `from` and each active member,
 * capacity vs. minutes of chores assigned (the planner's own split, via
 * summarizeDayLoad), plus FIXED chores nobody can get because their owners left.
 */
export async function getWeekLoad(
  deps: Deps,
  userId: string,
  familyId: string,
  query: { from?: string | undefined; days: number },
): Promise<WeekLoad> {
  await requireParent(deps.db, familyId, userId);
  const from =
    (query.from as PlainDate | undefined) ??
    (await familyToday(deps.db, familyId, deps.now())).today;
  const dates = Array.from({ length: query.days }, (_, i) => addDays(from, i));
  const to = dates.at(-1) ?? from;

  const members = await deps.db.membership.findMany({
    where: { familyId, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, capacity: true },
  });
  const rows = await deps.db.choreInstance.findMany({
    where: {
      familyId,
      occurrenceDate: { gte: plainToDbDate(from), lte: plainToDbDate(to) },
    },
    select: {
      occurrenceDate: true,
      status: true,
      effortMinutes: true,
      assignees: { select: { membershipId: true } },
    },
  });
  const fixedChores = await deps.db.chore.findMany({
    where: { familyId, active: true, assignMode: "FIXED" },
    select: { id: true, name: true, eligible: { select: { membershipId: true } } },
    orderBy: { name: "asc" },
  });

  const summary = summarizeDayLoad(
    members.map((m) => ({ id: m.id, weeklyCapacity: weeklyCapacitySchema.parse(m.capacity) })),
    rows.map((r) => ({
      date: dbDateToPlain(r.occurrenceDate),
      status: r.status,
      effortMinutes: r.effortMinutes,
      assigneeIds: r.assignees.map((a) => a.membershipId),
    })),
    dates,
  );
  const activeIds = new Set(members.map((m) => m.id));
  return {
    from,
    days: dates.map((date) => ({
      date,
      members: summary
        .filter((s) => s.date === date)
        .map(({ memberId, capacityMinutes, assignedMinutes, overCapacity }) => ({
          membershipId: memberId,
          capacityMinutes,
          assignedMinutes,
          overCapacity,
        })),
    })),
    choresWithoutOwners: fixedChores
      .filter((c) => !c.eligible.some((e) => activeIds.has(e.membershipId)))
      .map(({ id, name }) => ({ id, name })),
  };
}
