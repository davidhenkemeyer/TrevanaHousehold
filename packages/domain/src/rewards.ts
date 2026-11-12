/**
 * Rewards: what a family pays chores in, and the arithmetic on it.
 *
 * Each family picks one currency: real MONEY (integer cents), POINTS
 * (redeemed against a catalog the parents define), or NONE. Balances are
 * never stored: a member's balance is the sum of their ledger entries in
 * that currency, so there's nothing to drift out of sync.
 *
 * Product rules (branding doc):
 *   - Earned rewards are never taken away as punishment. The only negative
 *     entries are payouts, redemptions, and CORRECTIONs of genuine mistakes,
 *     which always carry a note.
 *   - Routine chores earn no coins by default; extra jobs do. A parent can
 *     still attach a reward to a routine on purpose.
 *   - Changing the family's currency never converts or erases anything;
 *     every entry records the currency it was made in.
 */
import { splitPoints } from "./points.js";

export const REWARD_CURRENCIES = ["NONE", "MONEY", "POINTS"] as const;
export type RewardCurrency = (typeof REWARD_CURRENCIES)[number];
/** Currencies an amount can actually be held in. */
export type CoinCurrency = Exclude<RewardCurrency, "NONE">;

/** Money currencies offered (all use two decimal places, so amounts are cents). */
export const MONEY_CODES = ["USD", "CAD", "EUR", "GBP", "AUD", "NZD"] as const;
export type MoneyCode = (typeof MONEY_CODES)[number];

/** Routine = baseline duty (XP only by default). Extra job = optional, earns coins. */
export const CHORE_KINDS = ["ROUTINE", "EXTRA_JOB"] as const;
export type ChoreKind = (typeof CHORE_KINDS)[number];

export const LEDGER_TYPES = [
  "EARNED", // a chore was approved
  "PAYOUT", // a parent paid money out (negative)
  "REDEMPTION", // points held for a catalog reward (negative)
  "REDEMPTION_REFUND", // the request was denied or canceled (positive)
  "CORRECTION", // a parent fixed a mistake (either sign, note required)
] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

export const REDEMPTION_STATUSES = ["REQUESTED", "APPROVED", "DENIED", "CANCELED"] as const;
export type RedemptionStatus = (typeof REDEMPTION_STATUSES)[number];

/** Largest single amount (reward, payout, correction, catalog cost): 1,000,000 cents or points. */
export const MAX_AMOUNT = 1_000_000;

/**
 * Who earns what when a chore is approved. Shared chores split the reward in
 * whole units; any remainder goes to the first assignees by id (see splitPoints).
 * No reward, or nobody assigned, earns nothing.
 */
export function earnings(
  rewardAmount: number,
  assigneeIds: readonly string[],
): Map<string, number> {
  if (rewardAmount <= 0 || assigneeIds.length === 0) return new Map();
  const split = splitPoints(rewardAmount, assigneeIds);
  for (const [id, amount] of split) if (amount === 0) split.delete(id);
  return split;
}

/** A balance is simply the sum of signed ledger amounts. It can be negative (an advance). */
export function balanceOf(amounts: Iterable<number>): number {
  let total = 0;
  for (const amount of amounts) total += amount;
  return total;
}

/** Points can only be spent if they're there: redemptions never go below zero. */
export function canRedeem(balance: number, cost: number): boolean {
  return Number.isInteger(cost) && cost > 0 && balance >= cost;
}

/** "$5.00", "-$1.50", "50 pts", "1 pt". Money amounts are in cents. */
export function formatAmount(
  currency: CoinCurrency,
  currencyCode: string | null | undefined,
  amount: number,
): string {
  if (currency === "POINTS") return `${amount} ${Math.abs(amount) === 1 ? "pt" : "pts"}`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode ?? "USD",
  }).format(amount / 100);
}

/** "5", "5.5", "$5.50" → 550 cents. Null when it isn't a sensible amount. */
export function parseMoney(text: string): number | null {
  const cleaned = text.trim().replace(/^[^\d.-]+/, "");
  if (!/^\d{1,7}(\.\d{0,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  return cents <= MAX_AMOUNT ? cents : null;
}

/** Whether a chore of this kind shows a reward by default in the editor. */
export function paysByDefault(kind: ChoreKind): boolean {
  return kind === "EXTRA_JOB";
}
