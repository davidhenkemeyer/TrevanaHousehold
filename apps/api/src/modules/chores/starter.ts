/**
 * The starter chore list, offered to one family: which templates suit its
 * members' ages, which it already has, and adding many at once.
 *
 * Templates live in packages/domain/src/starterChores.ts. An added template
 * becomes an ordinary AUTO chore pooled to the members old enough for it, and
 * remembers its template id so it isn't added twice.
 */
import type {
  AddStarterChoresBody,
  AddStarterChoresResult,
  StarterChoreList,
  StarterChoreView,
} from "@tenara/contracts";
import {
  type AgeMember,
  type MinAge,
  ROOMS,
  ROOM_LABELS,
  STARTER_CHORES,
  type StarterChore,
  describeRecurrence,
  findStarterChore,
  starterDeadlineMinutes,
  starterEligible,
  starterRecurrence,
  suitsFamily,
} from "@tenara/domain";
import type { Deps } from "../../deps.js";
import { badRequest } from "../../errors.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { requireParent } from "../access.js";
import { familyToday, planFamily } from "../instances/generate.js";
import { photoSigner } from "../instances/views.js";
import { choreInclude, toChoreDto } from "./service.js";

type DbOrTx = Deps["db"] | Prisma.TransactionClient;

const MIN_AGE_LABELS: Record<MinAge, string> = {
  LITTLE: "Ages 4+",
  KID: "Ages 7+",
  TWEEN: "Ages 11+",
  TEEN: "Ages 14+",
  ADULT: "Parents",
};

async function ageMembers(db: DbOrTx, familyId: string): Promise<AgeMember[]> {
  const members = await db.membership.findMany({
    where: { familyId, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, ageGroup: true },
  });
  return members;
}

async function addedTemplateIds(db: DbOrTx, familyId: string): Promise<Set<string>> {
  const rows = await db.chore.findMany({
    where: { familyId, active: true, templateId: { not: null } },
    select: { templateId: true },
  });
  return new Set(rows.flatMap((r) => (r.templateId ? [r.templateId] : [])));
}

export async function listStarterChores(
  deps: Deps,
  userId: string,
  familyId: string,
): Promise<StarterChoreList> {
  await requireParent(deps.db, familyId, userId);
  const { today } = await familyToday(deps.db, familyId, deps.now());
  const members = await ageMembers(deps.db, familyId);
  const added = await addedTemplateIds(deps.db, familyId);

  const view = (t: StarterChore): StarterChoreView => ({
    id: t.id,
    name: t.name,
    room: t.room,
    effortMinutes: t.effortMinutes,
    howOften: describeRecurrence(starterRecurrence(t, today)),
    timeOfDay: t.timeOfDay ?? null,
    cue: t.cue ?? null,
    checklist: [...(t.checklist ?? [])],
    minAge: t.minAge,
    minAgeLabel: MIN_AGE_LABELS[t.minAge],
    suggested: t.suggested === true && suitsFamily(t, members),
    added: added.has(t.id),
  });
  return {
    rooms: ROOMS.map((room) => ({
      room,
      label: ROOM_LABELS[room],
      chores: STARTER_CHORES.filter((t) => t.room === room).map(view),
    })),
  };
}

/**
 * Adds the chosen templates as chores, in one transaction, then plans once.
 * Templates the family already has are skipped (and listed), so a double tap
 * or a second visit to setup never duplicates chores.
 */
export async function addStarterChores(
  deps: Deps,
  userId: string,
  familyId: string,
  body: AddStarterChoresBody,
): Promise<AddStarterChoresResult> {
  const parent = await requireParent(deps.db, familyId, userId);
  const templates = body.templateIds.map((id) => {
    const t = findStarterChore(id);
    if (!t) throw badRequest("UNKNOWN_TEMPLATE", `There's no starter chore "${id}".`);
    return t;
  });

  return deps.db.$transaction(async (tx) => {
    const { today } = await familyToday(tx, familyId, deps.now());
    const members = await ageMembers(tx, familyId);
    const added = await addedTemplateIds(tx, familyId);
    const skipped: string[] = [];
    const created = [];
    for (const t of templates) {
      if (added.has(t.id)) {
        skipped.push(t.id);
        continue;
      }
      const eligible = starterEligible(t, members);
      const chore = await tx.chore.create({
        data: {
          familyId,
          createdById: parent.id,
          templateId: t.id,
          name: t.name,
          cue: t.cue ?? null,
          kind: "ROUTINE",
          effortMinutes: t.effortMinutes,
          recurrence: { ...starterRecurrence(t, today) },
          deadlineMinutes: starterDeadlineMinutes(t),
          assignMode: "AUTO",
          checklist: {
            create: (t.checklist ?? []).map((text, position) => ({ text, position })),
          },
          eligible: {
            create: eligible.map((membershipId, position) => ({ membershipId, position })),
          },
        },
        include: choreInclude,
      });
      created.push(chore);
    }
    if (created.length > 0) await planFamily(tx, familyId, deps.now());
    const sign = photoSigner(deps);
    const chores = [];
    for (const chore of created) chores.push(await toChoreDto(chore, sign));
    return { chores, skipped };
  });
}
