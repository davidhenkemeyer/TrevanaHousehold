/**
 * Showing and typing reward amounts. The arithmetic and the rules live in
 * @tenara/domain (rewards.ts) and the API; this only turns amounts into words
 * and typed text into amounts.
 */
import type { LedgerEntry } from "@tenara/contracts";
import {
  type CoinCurrency,
  MAX_AMOUNT,
  type RewardCurrency,
  formatAmount,
  parseMoney,
} from "@tenara/domain";

/** Formats amounts in the family's currency, or null when rewards are off. */
export function amountFormatter(
  currency: RewardCurrency | undefined,
  currencyCode: string | undefined,
): ((amount: number) => string) | null {
  if (currency === undefined || currency === "NONE") return null;
  return (amount) => formatAmount(currency, currencyCode, amount);
}

/** "+$2.00" / "+20 pts" for reward chips. */
export function rewardLabel(format: (amount: number) => string, amount: number): string {
  return `+${format(amount)}`;
}

/** What someone typed as an amount: dollars for money ("2.50"), whole points otherwise. */
export function parseAmountInput(currency: CoinCurrency, text: string): number | null {
  if (currency === "MONEY") return parseMoney(text);
  const trimmed = text.trim();
  if (!/^\d{1,7}$/.test(trimmed)) return null;
  const points = Number(trimmed);
  return points <= MAX_AMOUNT ? points : null;
}

/** The text to put in an amount field for a stored amount ("" for zero). */
export function amountInputValue(currency: CoinCurrency, amount: number): string {
  if (amount === 0) return "";
  return currency === "MONEY" ? (amount / 100).toFixed(2) : String(amount);
}

/** One line of history, in plain words. */
export function describeEntry(entry: LedgerEntry): string {
  switch (entry.type) {
    case "EARNED":
      return entry.choreName ?? "A chore";
    case "PAYOUT":
      return entry.note ? `Paid out: ${entry.note}` : "Paid out";
    case "REDEMPTION":
      return `Asked for: ${entry.itemName ?? "a reward"}`;
    case "REDEMPTION_REFUND":
      return `Points back: ${entry.itemName ?? "a reward"}`;
    case "CORRECTION":
      return `Correction: ${entry.note ?? ""}`.trim();
  }
}

/** "+$2.00" or "-$5.00": history amounts always show their sign. */
export function signedAmount(format: (amount: number) => string, amount: number): string {
  return amount > 0 ? `+${format(amount)}` : format(amount);
}
