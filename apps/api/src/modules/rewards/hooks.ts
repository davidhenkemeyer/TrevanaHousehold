/**
 * What approving a chore earns, called by the instance state machine
 * (transitions.ts) inside the approval's transaction. This is the only place
 * chore rewards, XP, and badges are written:
 *
 *   1. coins: one EARNED ledger entry per assignee, split in whole units, in
 *      the family's currency (none when the currency is NONE);
 *   2. XP: each assignee earns the chore's full XP;
 *   3. badges: any the assignees have newly earned (never removed);
 *   4. the family goal: marked reached when everyone's XP crosses its target.
 *
 * Unique constraints plus `skipDuplicates` make every step safe to repeat.
 * XP and badges are recorded even when the family hides them.
 */
import { earnedBadges, earnings, goalProgress } from "@titan/domain";
import type { Prisma } from "../../generated/prisma/client.js";
import { memberHistory } from "../progress/history.js";

export interface ApprovedInstance {
  id: string;
  familyId: string;
  rewardAmount: number;
  effortMinutes: number;
  /** XP each assignee earns. */
  xp: number;
  assigneeIds: string[];
}

export async function onApproved(
  tx: Prisma.TransactionClient,
  now: Date,
  instance: ApprovedInstance,
): Promise<void> {
  const family = await tx.family.findUniqueOrThrow({
    where: { id: instance.familyId },
    select: { rewardCurrency: true, currencyCode: true, timeZone: true },
  });

  // 1. Coins.
  const shares =
    family.rewardCurrency === "NONE"
      ? new Map<string, number>()
      : earnings(instance.rewardAmount, instance.assigneeIds);
  if (shares.size > 0) {
    await tx.ledgerEntry.createMany({
      data: [...shares].map(([membershipId, amount]) => ({
        familyId: instance.familyId,
        membershipId,
        currency: family.rewardCurrency,
        currencyCode: family.rewardCurrency === "MONEY" ? family.currencyCode : null,
        amount,
        type: "EARNED" as const,
        instanceId: instance.id,
        createdAt: now,
      })),
      skipDuplicates: true,
    });
  }

  if (instance.assigneeIds.length === 0 || instance.xp <= 0) return;

  // 2. XP: the full amount for each assignee (XP isn't split).
  await tx.xpEntry.createMany({
    data: instance.assigneeIds.map((membershipId) => ({
      familyId: instance.familyId,
      membershipId,
      instanceId: instance.id,
      amount: instance.xp,
      createdAt: now,
    })),
    skipDuplicates: true,
  });

  // 3. Badges.
  for (const membershipId of instance.assigneeIds) {
    const history = await memberHistory(tx, membershipId, family.timeZone, now);
    const badges = earnedBadges(history.badges);
    if (badges.length === 0) continue;
    await tx.memberBadge.createMany({
      data: badges.map((b) => ({
        membershipId,
        key: b.key,
        label: b.label,
        choreId: b.choreId ?? null,
        awardedAt: now,
      })),
      skipDuplicates: true,
    });
  }

  // 4. The family goal.
  const goal = await tx.familyGoal.findFirst({
    where: { familyId: instance.familyId, closedAt: null, reachedAt: null },
  });
  if (goal) {
    const total = await tx.xpEntry.aggregate({
      where: { familyId: instance.familyId, createdAt: { gte: goal.startedAt } },
      _sum: { amount: true },
    });
    if (goalProgress(total._sum.amount ?? 0, goal.targetXp).reached) {
      await tx.familyGoal.update({ where: { id: goal.id }, data: { reachedAt: now } });
    }
  }
}
