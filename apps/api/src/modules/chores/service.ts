/**
 * Chore definitions. Parents create, edit, and archive; every member can read.
 * Changes that affect scheduling re-plan the chore's untouched future
 * occurrences right away, so the Today view reflects them immediately.
 */
import type {
  Chore as ChoreDto,
  ChoreList,
  CreateChoreBody,
  UpdateChoreBody,
} from "@titan/contracts";
import type { Deps } from "../../deps.js";
import { badRequest, notFound } from "../../errors.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { requireMember, requireParent } from "../access.js";
import { familyToday, planFamily, removeUntouchedFuture } from "../instances/generate.js";
import { type SignPhoto, photoSigner } from "../instances/views.js";
import { displayNameOf, notify } from "../notifications/service.js";
import { checkUploads, claimUploads } from "../uploads/service.js";

type Tx = Prisma.TransactionClient;

const choreInclude = {
  checklist: { orderBy: { position: "asc" } },
  eligible: { orderBy: { position: "asc" } },
} as const satisfies Prisma.ChoreInclude;
type ChoreRow = Prisma.ChoreGetPayload<{ include: typeof choreInclude }>;

/** Fields whose change alters when, to whom, or for how much a chore is scheduled. */
const SCHEDULING_FIELDS = [
  "recurrence",
  "effortMinutes",
  "deadlineMinutes",
  "assignMode",
  "eligibleMembershipIds",
  "defaultPriority",
  "rewardAmount",
] as const satisfies readonly (keyof UpdateChoreBody)[];

async function toChoreDto(chore: ChoreRow, sign: SignPhoto): Promise<ChoreDto> {
  return {
    id: chore.id,
    name: chore.name,
    description: chore.description,
    cue: chore.cue,
    kind: chore.kind,
    xpOverride: chore.xpOverride,
    effortMinutes: chore.effortMinutes,
    defaultPriority: chore.defaultPriority,
    requiresPhoto: chore.requiresPhoto,
    reviewPolicy: chore.reviewPolicy,
    rewardAmount: chore.rewardAmount,
    recurrence: chore.recurrence as ChoreDto["recurrence"],
    deadlineMinutes: chore.deadlineMinutes,
    assignMode: chore.assignMode,
    eligibleMembershipIds: chore.eligible.map((e) => e.membershipId),
    checklist: chore.checklist.map((i) => ({ id: i.id, text: i.text })),
    referencePhotoUrl: chore.referencePhotoKey ? await sign(chore.referencePhotoKey) : null,
    active: chore.active,
    createdAt: chore.createdAt.toISOString(),
    updatedAt: chore.updatedAt.toISOString(),
  };
}

async function assertActiveMembers(
  tx: Tx,
  familyId: string,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  const found = await tx.membership.count({
    where: { familyId, active: true, id: { in: [...ids] } },
  });
  if (found !== ids.length) {
    throw badRequest(
      "UNKNOWN_MEMBER",
      "Every assigned member must be an active member of this family.",
    );
  }
}

async function findChore(
  tx: Tx | Deps["db"],
  familyId: string,
  choreId: string,
): Promise<ChoreRow> {
  const chore = await tx.chore.findFirst({
    where: { id: choreId, familyId },
    include: choreInclude,
  });
  if (!chore) throw notFound("CHORE_NOT_FOUND", "Chore not found.");
  return chore;
}

export async function createChore(
  deps: Deps,
  userId: string,
  familyId: string,
  body: CreateChoreBody,
): Promise<ChoreDto> {
  const parent = await requireParent(deps.db, familyId, userId);
  const [photo] = await checkUploads(deps, {
    familyId,
    member: parent,
    purpose: "REFERENCE",
    uploadIds: body.referencePhotoUploadId ? [body.referencePhotoUploadId] : [],
  });
  return deps.db.$transaction(async (tx) => {
    await assertActiveMembers(tx, familyId, body.eligibleMembershipIds);
    if (photo) await claimUploads(tx, [photo], deps.now());
    const chore = await tx.chore.create({
      data: {
        familyId,
        createdById: parent.id,
        name: body.name,
        description: body.description,
        cue: body.cue,
        kind: body.kind,
        xpOverride: body.xpOverride,
        effortMinutes: body.effortMinutes,
        defaultPriority: body.defaultPriority,
        requiresPhoto: body.requiresPhoto,
        reviewPolicy: body.reviewPolicy,
        rewardAmount: body.rewardAmount,
        recurrence: body.recurrence,
        deadlineMinutes: body.deadlineMinutes,
        assignMode: body.assignMode,
        referencePhotoKey: photo?.key ?? null,
        checklist: { create: body.checklist.map((text, position) => ({ text, position })) },
        eligible: {
          create: body.eligibleMembershipIds.map((membershipId, position) => ({
            membershipId,
            position,
          })),
        },
      },
      include: choreInclude,
    });
    await planFamily(tx, familyId, deps.now());
    // Its owners hear about a new chore once, not every day it comes up.
    if (body.assignMode === "FIXED") {
      await notify(tx, deps.now(), {
        familyId,
        to: body.eligibleMembershipIds,
        exclude: parent.id,
        type: "NEW_CHORE",
        details: { choreName: body.name, actorName: await displayNameOf(tx, parent.id) },
      });
    }
    return toChoreDto(chore, photoSigner(deps));
  });
}

export async function listChores(
  deps: Deps,
  userId: string,
  familyId: string,
  includeArchived: boolean,
): Promise<ChoreList> {
  await requireMember(deps.db, familyId, userId);
  const chores = await deps.db.chore.findMany({
    where: { familyId, ...(includeArchived ? {} : { active: true }) },
    include: choreInclude,
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  const sign = photoSigner(deps);
  return { chores: await Promise.all(chores.map((c) => toChoreDto(c, sign))) };
}

export async function getChore(
  deps: Deps,
  userId: string,
  familyId: string,
  choreId: string,
): Promise<ChoreDto> {
  await requireMember(deps.db, familyId, userId);
  return toChoreDto(await findChore(deps.db, familyId, choreId), photoSigner(deps));
}

export async function updateChore(
  deps: Deps,
  userId: string,
  familyId: string,
  choreId: string,
  body: UpdateChoreBody,
): Promise<ChoreDto> {
  const parent = await requireParent(deps.db, familyId, userId);
  // A replaced or removed reference photo is deleted later by the cleanup job.
  const [photo] = await checkUploads(deps, {
    familyId,
    member: parent,
    purpose: "REFERENCE",
    uploadIds: body.referencePhotoUploadId ? [body.referencePhotoUploadId] : [],
  });
  return deps.db.$transaction(async (tx) => {
    const existing = await findChore(tx, familyId, choreId);
    if (photo) await claimUploads(tx, [photo], deps.now());
    const assignMode = body.assignMode ?? existing.assignMode;
    const eligible = body.eligibleMembershipIds ?? existing.eligible.map((e) => e.membershipId);
    if (assignMode === "FIXED" && eligible.length === 0) {
      throw badRequest("FIXED_NEEDS_OWNER", "A FIXED chore needs at least one owner.");
    }
    if (body.eligibleMembershipIds) await assertActiveMembers(tx, familyId, eligible);

    await tx.chore.update({
      where: { id: choreId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.cue !== undefined && { cue: body.cue }),
        ...(body.kind !== undefined && { kind: body.kind }),
        ...(body.xpOverride !== undefined && { xpOverride: body.xpOverride }),
        ...(body.effortMinutes !== undefined && { effortMinutes: body.effortMinutes }),
        ...(body.defaultPriority !== undefined && { defaultPriority: body.defaultPriority }),
        ...(body.requiresPhoto !== undefined && { requiresPhoto: body.requiresPhoto }),
        ...(body.reviewPolicy !== undefined && { reviewPolicy: body.reviewPolicy }),
        ...(body.rewardAmount !== undefined && { rewardAmount: body.rewardAmount }),
        ...(body.recurrence !== undefined && { recurrence: body.recurrence }),
        ...(body.deadlineMinutes !== undefined && { deadlineMinutes: body.deadlineMinutes }),
        ...(body.assignMode !== undefined && { assignMode: body.assignMode }),
        ...(body.referencePhotoUploadId !== undefined && {
          referencePhotoKey: photo?.key ?? null,
        }),
      },
    });
    if (body.checklist) {
      // Submissions snapshot item text, so replacing the list never rewrites history.
      await tx.choreChecklistItem.deleteMany({ where: { choreId } });
      await tx.choreChecklistItem.createMany({
        data: body.checklist.map((text, position) => ({ choreId, text, position })),
      });
    }
    if (body.eligibleMembershipIds) {
      await tx.choreEligible.deleteMany({ where: { choreId } });
      await tx.choreEligible.createMany({
        data: eligible.map((membershipId, position) => ({ choreId, membershipId, position })),
      });
    }

    if (SCHEDULING_FIELDS.some((field) => body[field] !== undefined)) {
      const { today } = await familyToday(tx, familyId, deps.now());
      await removeUntouchedFuture(tx, familyId, today, choreId);
      await planFamily(tx, familyId, deps.now());
    }
    return toChoreDto(await findChore(tx, familyId, choreId), photoSigner(deps));
  });
}

/** Archives a chore: no new occurrences, untouched future ones removed, history kept. */
export async function archiveChore(
  deps: Deps,
  userId: string,
  familyId: string,
  choreId: string,
): Promise<void> {
  await requireParent(deps.db, familyId, userId);
  await deps.db.$transaction(async (tx) => {
    await findChore(tx, familyId, choreId);
    await tx.chore.update({ where: { id: choreId }, data: { active: false } });
    const { today } = await familyToday(tx, familyId, deps.now());
    await removeUntouchedFuture(tx, familyId, today, choreId);
  });
}
