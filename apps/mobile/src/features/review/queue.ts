/**
 * Approval queue helpers: grouping the loaded items by child and putting the
 * batch-approve results into words. The server decides what's eligible
 * (`batchEligible`) and checks it again on approval.
 */
import type { BatchApproveResponse, ReviewQueueItem } from "@titan/contracts";

export interface QueueGroup {
  membershipId: string;
  displayName: string;
  avatarColor: string;
  items: ReviewQueueItem[];
}

/** Groups by whoever submitted, keeping the queue's order (newest first) inside each group. */
export function groupByChild(items: readonly ReviewQueueItem[]): QueueGroup[] {
  const groups = new Map<string, QueueGroup>();
  for (const item of items) {
    const who = item.submission.submittedBy;
    let group = groups.get(who.membershipId);
    if (!group) {
      group = { ...who, items: [] };
      groups.set(who.membershipId, group);
    }
    group.items.push(item);
  }
  return [...groups.values()];
}

export function batchEligibleIds(items: readonly ReviewQueueItem[]): string[] {
  return items.filter((i) => i.batchEligible).map((i) => i.submission.id);
}

/** "3 approved." / "2 approved; 1 needs a closer look." */
export function describeBatchResult(response: BatchApproveResponse): string {
  const ok = response.results.filter((r) => r.ok).length;
  const failed = response.results.length - ok;
  const approved = `${ok} approved`;
  if (failed === 0) return `${approved}.`;
  return `${approved}; ${failed} ${failed === 1 ? "needs" : "need"} a closer look.`;
}

/** Everyone who appears in the loaded queue, for the filter chips. */
export function childrenInQueue(items: readonly ReviewQueueItem[]) {
  return groupByChild(items).map(({ items: _items, ...person }) => person);
}
