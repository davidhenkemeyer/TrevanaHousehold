import type { Plan } from "@tenara/contracts";
import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/http";
import { daysLeft, isProRequired, planHeadline, yearlyLabel } from "./plan";

const now = new Date("2026-11-11T12:00:00Z");
const base: Plan = {
  tier: "PRO",
  reason: "TRIAL",
  endsAt: "2026-11-20T12:00:00.000Z",
  trialUsed: false,
  willRenew: false,
  store: null,
  features: {
    extraMembers: true,
    photos: true,
    money: true,
    catalog: true,
    jobBoard: true,
    familyGoal: true,
    widgets: true,
    fullHistory: true,
  },
  limits: { maxParents: null, maxKids: null, historyDays: null },
};

describe("plan wording", () => {
  it("counts trial days, rounding up and never showing 0 while time is left", () => {
    expect(daysLeft("2026-11-20T12:00:00.000Z", now)).toBe(9);
    expect(daysLeft("2026-11-11T13:00:00.000Z", now)).toBe(1);
    expect(daysLeft("2026-11-10T12:00:00.000Z", now)).toBe(0);
  });

  it("words each state", () => {
    expect(planHeadline(base, now)).toBe("Pro trial · 9 days left");
    expect(planHeadline({ ...base, endsAt: "2026-11-12T12:00:00.000Z" }, now)).toBe(
      "Pro trial · 1 day left",
    );
    expect(planHeadline({ ...base, tier: "BASIC", reason: null, endsAt: null }, now)).toBe(
      "Basic (free)",
    );
    const paid = { ...base, reason: "SUBSCRIPTION" as const, endsAt: "2026-12-11T12:00:00.000Z" };
    expect(planHeadline({ ...paid, willRenew: true }, now)).toBe("Pro · renews Dec 11");
    expect(planHeadline(paid, now)).toBe("Pro · ends Dec 11");
    expect(planHeadline({ ...paid, endsAt: "9999-12-31T00:00:00.000Z" }, now)).toBe("Pro");
  });

  it("spots Pro-required errors", () => {
    expect(isProRequired(new ApiError(403, "PRO_REQUIRED", "x"))).toBe(true);
    expect(isProRequired(new ApiError(403, "PARENT_REQUIRED", "x"))).toBe(false);
    expect(isProRequired(new Error("x"))).toBe(false);
  });

  it("labels the yearly price", () => {
    expect(yearlyLabel("$34.99", "$2.92")).toBe("$34.99 a year (about $2.92 a month)");
    expect(yearlyLabel("$34.99", null)).toBe("$34.99 a year");
  });
});
