import type { LedgerEntry } from "@titan/contracts";
import { describe, expect, it } from "vitest";
import {
  amountFormatter,
  amountInputValue,
  describeEntry,
  parseAmountInput,
  rewardLabel,
  signedAmount,
} from "./format";

const entry = (overrides: Partial<LedgerEntry>): LedgerEntry => ({
  id: "e",
  membershipId: "m",
  currency: "POINTS",
  currencyCode: null,
  amount: 50,
  type: "EARNED",
  note: null,
  choreName: null,
  itemName: null,
  createdBy: null,
  createdAt: "2026-11-10T12:00:00.000Z",
  ...overrides,
});

describe("reward formatting", () => {
  it("formats in the family's currency, or not at all when rewards are off", () => {
    expect(amountFormatter("NONE", "USD")).toBeNull();
    expect(amountFormatter(undefined, undefined)).toBeNull();
    const money = amountFormatter("MONEY", "USD")!;
    const points = amountFormatter("POINTS", "USD")!;
    expect(rewardLabel(money, 200)).toBe("+$2.00");
    expect(rewardLabel(points, 20)).toBe("+20 pts");
    expect(signedAmount(money, -500)).toBe("-$5.00");
    expect(signedAmount(points, 5)).toBe("+5 pts");
  });

  it("reads typed amounts: dollars for money, whole points otherwise", () => {
    expect(parseAmountInput("MONEY", "2.5")).toBe(250);
    expect(parseAmountInput("MONEY", "x")).toBeNull();
    expect(parseAmountInput("POINTS", " 50 ")).toBe(50);
    expect(parseAmountInput("POINTS", "2.5")).toBeNull();
    expect(parseAmountInput("POINTS", "1000001")).toBeNull();
    expect(amountInputValue("MONEY", 250)).toBe("2.50");
    expect(amountInputValue("POINTS", 50)).toBe("50");
    expect(amountInputValue("MONEY", 0)).toBe("");
  });

  it("describes history entries in plain words", () => {
    expect(describeEntry(entry({ choreName: "Dishes" }))).toBe("Dishes");
    expect(describeEntry(entry({ type: "PAYOUT", note: "Allowance" }))).toBe("Paid out: Allowance");
    expect(describeEntry(entry({ type: "PAYOUT" }))).toBe("Paid out");
    expect(describeEntry(entry({ type: "REDEMPTION", itemName: "Screen time" }))).toBe(
      "Asked for: Screen time",
    );
    expect(describeEntry(entry({ type: "REDEMPTION_REFUND", itemName: "Screen time" }))).toBe(
      "Points back: Screen time",
    );
    expect(describeEntry(entry({ type: "CORRECTION", note: "Entered twice" }))).toBe(
      "Correction: Entered twice",
    );
  });
});
