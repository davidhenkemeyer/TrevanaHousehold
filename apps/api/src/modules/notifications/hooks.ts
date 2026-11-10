/**
 * Notification hooks called by the API and jobs. Step 10 (push notifications)
 * fills these in; until then they do nothing.
 */
import type { Prisma } from "../../generated/prisma/client.js";

export interface LateInstance {
  id: string;
  familyId: string;
  assigneeIds: string[];
}

/** Called once per instance, right after it is marked late ("A chore assigned to you is now late"). */
export async function onMarkedLate(
  _tx: Prisma.TransactionClient,
  _instance: LateInstance,
): Promise<void> {
  // Intentionally empty until push notifications exist (Step 10).
}
