/**
 * Reward point calculations.
 */

/**
 * Splits a chore's points among its assignees as whole numbers that always
 * sum to `total`. Any remainder goes one point each to the first assignees in
 * sorted-id order, so the result is deterministic regardless of input order.
 *
 * splitPoints(10, ["sally", "billy"]) → Map { billy → 5, sally → 5 }
 * splitPoints(5,  ["sally", "billy"]) → Map { billy → 3, sally → 2 }
 */
export function splitPoints(total: number, assigneeIds: readonly string[]): Map<string, number> {
  if (!Number.isInteger(total) || total < 0) {
    throw new RangeError(`Points must be a non-negative integer, got ${total}`);
  }
  const ids = [...new Set(assigneeIds)].sort();
  if (ids.length === 0) {
    throw new RangeError("Cannot split points among zero assignees");
  }
  const base = Math.floor(total / ids.length);
  const remainder = total % ids.length;
  return new Map(ids.map((id, i) => [id, base + (i < remainder ? 1 : 0)]));
}
