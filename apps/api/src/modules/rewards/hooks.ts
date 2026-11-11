/**
 * Reward hooks called by the instance state machine (transitions.ts).
 *
 * `onApproved` is the only place a chore reward is written: one EARNED ledger
 * entry per assignee, in the family's currency at that moment. The unique
 * (instance, member, type) constraint plus `skipDuplicates` make it safe to
 * run twice. Step 9 (gamification) will add XP here.
 */
import { earnings } from "@titan/domain";
import type { Prisma } from "../../generated/prisma/client.js";

export interface ApprovedInstance {
  id: string;
  familyId: string;
  rewardAmount: number;
  effortMinutes: number;
  assigneeIds: string[];
}

export async function onApproved(
  tx: Prisma.TransactionClient,
  now: Date,
  instance: ApprovedInstance,
): Promise<void> {
  if (instance.rewardAmount <= 0) return;
  const family = await tx.family.findUniqueOrThrow({
    where: { id: instance.familyId },
    select: { rewardCurrency: true, currencyCode: true },
  });
  if (family.rewardCurrency === "NONE") return;

  const shares = earnings(instance.rewardAmount, instance.assigneeIds);
  if (shares.size === 0) return;
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
