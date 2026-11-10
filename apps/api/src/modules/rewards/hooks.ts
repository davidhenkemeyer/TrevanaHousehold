/**
 * Reward hooks called by the instance state machine. Step 8 (rewards) and
 * Step 9 (gamification) fill these in; until then approval releases nothing.
 */
import type { Prisma } from "../../generated/prisma/client.js";

export interface ApprovedInstance {
  id: string;
  familyId: string;
  rewardAmount: number;
  effortMinutes: number;
  assigneeIds: string[];
}

export async function onApproved(
  _tx: Prisma.TransactionClient,
  _instance: ApprovedInstance,
): Promise<void> {
  // Intentionally empty until the rewards ledger exists (Step 8).
}
