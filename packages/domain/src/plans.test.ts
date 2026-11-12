import { describe, expect, it } from "vitest";
import {
  boardOpen,
  canAddMember,
  earnsCoins,
  effectivePlan,
  featureMap,
  historyStart,
  photoRequired,
  trialEndsAtFor,
} from "./plans.js";

const now = new Date("2026-11-11T12:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);
const BASIC = { tier: "BASIC" } as const;
const PRO = { tier: "PRO" } as const;

describe("effectivePlan", () => {
  it("is Pro during the trial", () => {
    expect(effectivePlan({ trialEndsAt: days(3), proExpiresAt: null }, now)).toEqual({
      tier: "PRO",
      reason: "TRIAL",
      endsAt: days(3),
      trialUsed: false,
    });
  });

  it("is Basic after the trial, and remembers it was used", () => {
    expect(effectivePlan({ trialEndsAt: days(-1), proExpiresAt: null }, now)).toEqual({
      tier: "BASIC",
      reason: null,
      endsAt: null,
      trialUsed: true,
    });
  });

  it("is Pro while a subscription is current, ending at the later date", () => {
    expect(effectivePlan({ trialEndsAt: days(-1), proExpiresAt: days(30) }, now)).toMatchObject({
      tier: "PRO",
      reason: "SUBSCRIPTION",
      endsAt: days(30),
    });
    // Subscribing during the trial keeps the rest of the trial.
    expect(effectivePlan({ trialEndsAt: days(10), proExpiresAt: days(5) }, now)).toMatchObject({
      reason: "SUBSCRIPTION",
      endsAt: days(10),
    });
  });

  it("is Basic once a subscription lapses, and with no trial at all", () => {
    expect(effectivePlan({ trialEndsAt: null, proExpiresAt: days(-1) }, now).tier).toBe("BASIC");
    expect(effectivePlan({ trialEndsAt: null, proExpiresAt: null }, now)).toMatchObject({
      tier: "BASIC",
      trialUsed: false,
    });
    // The exact end moment counts as ended.
    expect(effectivePlan({ trialEndsAt: now, proExpiresAt: null }, now).tier).toBe("BASIC");
  });

  it("starts trials 14 days long", () => {
    expect(trialEndsAtFor(now)).toEqual(days(14));
  });
});

describe("limits and features", () => {
  it("fits 2 parents and 3 kids on Basic, any number on Pro", () => {
    expect(canAddMember(BASIC, "CHILD", { parents: 1, kids: 2 })).toBe(true);
    expect(canAddMember(BASIC, "CHILD", { parents: 1, kids: 3 })).toBe(false);
    expect(canAddMember(BASIC, "PARENT", { parents: 1, kids: 3 })).toBe(true);
    expect(canAddMember(BASIC, "PARENT", { parents: 2, kids: 0 })).toBe(false);
    expect(canAddMember(PRO, "CHILD", { parents: 2, kids: 9 })).toBe(true);
  });

  it("lists every feature for the app", () => {
    expect(featureMap(BASIC)).toMatchObject({ photos: false, money: false, widgets: false });
    expect(Object.values(featureMap(PRO)).every(Boolean)).toBe(true);
  });
});

describe("after Pro ends", () => {
  it("stops asking for photos but keeps the setting", () => {
    expect(photoRequired({ requiresPhoto: true }, PRO)).toBe(true);
    expect(photoRequired({ requiresPhoto: true }, BASIC)).toBe(false);
    expect(photoRequired({ requiresPhoto: false }, PRO)).toBe(false);
  });

  it("stops money but never points", () => {
    expect(earnsCoins("MONEY", PRO)).toBe(true);
    expect(earnsCoins("MONEY", BASIC)).toBe(false);
    expect(earnsCoins("POINTS", BASIC)).toBe(true);
    expect(earnsCoins("NONE", PRO)).toBe(false);
  });

  it("closes the job board and shortens history", () => {
    expect(boardOpen(PRO)).toBe(true);
    expect(boardOpen(BASIC)).toBe(false);
    expect(historyStart(PRO, now)).toBeNull();
    expect(historyStart(BASIC, now)).toEqual(days(-30));
  });
});
