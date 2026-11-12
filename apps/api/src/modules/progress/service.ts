/**
 * Progress: XP, levels, streaks, badges, and the family goal.
 *
 * Parents see everyone's progress; kids see only their own. Everyone sees
 * the family goal. There's no ranking of people anywhere.
 */
import type {
  BadgeDefinition as BadgeDefinitionDto,
  CreateGoalBody,
  FamilyGoal as FamilyGoalDto,
  MemberProgress,
  Progress,
} from "@tenara/contracts";
import { BADGES, MASTERY_BADGE, goalProgress, isMasteryKey, levelFor } from "@tenara/domain";
import type { Deps } from "../../deps.js";
import type { FamilyGoal } from "../../generated/prisma/client.js";
import { requireMember, requireParent } from "../access.js";
import { toPerson } from "../instances/views.js";
import { memberHistory } from "./history.js";

const definitionOf = (key: string): BadgeDefinitionDto => {
  const def = isMasteryKey(key) ? MASTERY_BADGE : BADGES.find((b) => b.key === key);
  return def
    ? { key: def.key, label: def.label, description: def.description, icon: def.icon }
    : { key, label: key, description: "", icon: "star" };
};

const ALL_BADGES: BadgeDefinitionDto[] = [...BADGES, MASTERY_BADGE].map((b) => ({
  key: b.key,
  label: b.label,
  description: b.description,
  icon: b.icon,
}));

async function toGoalDto(deps: Deps, goal: FamilyGoal): Promise<FamilyGoalDto> {
  const total = await deps.db.xpEntry.aggregate({
    where: { familyId: goal.familyId, createdAt: { gte: goal.startedAt } },
    _sum: { amount: true },
  });
  const progressXp = total._sum.amount ?? 0;
  return {
    id: goal.id,
    name: goal.name,
    targetXp: goal.targetXp,
    progressXp,
    percent: goalProgress(progressXp, goal.targetXp).percent,
    reachedAt: goal.reachedAt?.toISOString() ?? null,
    startedAt: goal.startedAt.toISOString(),
  };
}

export async function getProgress(deps: Deps, userId: string, familyId: string): Promise<Progress> {
  const viewer = await requireMember(deps.db, familyId, userId);
  const family = await deps.db.family.findUniqueOrThrow({ where: { id: familyId } });
  const now = deps.now();
  const members = await deps.db.membership.findMany({
    where: viewer.role === "PARENT" ? { familyId, active: true } : { id: viewer.id },
    orderBy: { createdAt: "asc" },
    include: { user: true, badges: { orderBy: { awardedAt: "desc" } } },
  });
  const xp = await deps.db.xpEntry.groupBy({
    by: ["membershipId"],
    where: { familyId, membershipId: { in: members.map((m) => m.id) } },
    _sum: { amount: true },
  });

  const rows: MemberProgress[] = [];
  for (const m of members) {
    const total = xp.find((x) => x.membershipId === m.id)?._sum.amount ?? 0;
    const { streak } = await memberHistory(deps.db, m.id, family.timeZone, now);
    rows.push({
      member: toPerson(m),
      xp: total,
      ...levelFor(total),
      streak,
      badges: m.badges.map((b) => ({
        ...definitionOf(b.key),
        key: b.key,
        // Mastery badges carry the chore's name ("Dishes master").
        label: b.label,
        awardedAt: b.awardedAt.toISOString(),
      })),
    });
  }

  const goal = await deps.db.familyGoal.findFirst({
    where: { familyId, closedAt: null },
    orderBy: { startedAt: "desc" },
  });
  return {
    gamification: family.gamification,
    members: rows,
    goal: goal ? await toGoalDto(deps, goal) : null,
    allBadges: ALL_BADGES,
  };
}

/** Starts a new family goal; XP earned from now on counts. Closes any open one. */
export async function startGoal(
  deps: Deps,
  userId: string,
  familyId: string,
  body: CreateGoalBody,
): Promise<FamilyGoalDto> {
  await requireParent(deps.db, familyId, userId);
  const now = deps.now();
  const goal = await deps.db.$transaction(async (tx) => {
    await tx.familyGoal.updateMany({
      where: { familyId, closedAt: null },
      data: { closedAt: now },
    });
    return tx.familyGoal.create({
      data: { familyId, name: body.name, targetXp: body.targetXp, startedAt: now },
    });
  });
  return toGoalDto(deps, goal);
}

export async function closeGoal(deps: Deps, userId: string, familyId: string): Promise<void> {
  await requireParent(deps.db, familyId, userId);
  await deps.db.familyGoal.updateMany({
    where: { familyId, closedAt: null },
    data: { closedAt: deps.now() },
  });
}
