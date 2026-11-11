import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFS,
  deliveryFor,
  digestDue,
  digestText,
  inQuietHours,
  notificationText,
  resolvePrefs,
} from "./notifications.js";
import { instantToPlainTime } from "./timezone.js";

describe("notification preferences", () => {
  it("defaults to the digest, with instant only for things someone is waiting on", () => {
    const p = DEFAULT_NOTIFICATION_PREFS;
    expect(deliveryFor("APPROVED", p)).toBe("DIGEST");
    expect(deliveryFor("NEEDS_REWORK", p)).toBe("INSTANT");
    expect(deliveryFor("REDEMPTION_REQUESTED", p)).toBe("INSTANT");
    expect(deliveryFor("APPROVED", { ...p, byType: { APPROVED: "OFF" } })).toBe("OFF");
  });

  it("fills in anything missing or malformed with the defaults", () => {
    expect(resolvePrefs(null)).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(
      resolvePrefs({
        digestTime: "25:99",
        quietStart: "22:00",
        byType: { APPROVED: "OFF", X: "OFF", REJECTED: "LOUD" },
      }),
    ).toEqual({ ...DEFAULT_NOTIFICATION_PREFS, quietStart: "22:00", byType: { APPROVED: "OFF" } });
  });
});

describe("timing", () => {
  const p = DEFAULT_NOTIFICATION_PREFS; // quiet 21:00–07:00

  it("knows quiet hours, across midnight too", () => {
    expect(inQuietHours("21:00", p)).toBe(true);
    expect(inQuietHours("23:59", p)).toBe(true);
    expect(inQuietHours("06:59", p)).toBe(true);
    expect(inQuietHours("07:00", p)).toBe(false);
    expect(inQuietHours("15:00", p)).toBe(false);
    const daytime = { ...p, quietStart: "13:00", quietEnd: "14:00" };
    expect(inQuietHours("13:30", daytime)).toBe(true);
    expect(inQuietHours("14:00", daytime)).toBe(false);
    expect(inQuietHours("03:00", { ...p, quietStart: "08:00", quietEnd: "08:00" })).toBe(false);
  });

  it("sends the digest once a day, at or after its time", () => {
    expect(digestDue("2026-11-10", "07:29", p, null)).toBe(false);
    expect(digestDue("2026-11-10", "07:30", p, null)).toBe(true);
    expect(digestDue("2026-11-10", "18:00", p, "2026-11-09")).toBe(true);
    expect(digestDue("2026-11-10", "18:00", p, "2026-11-10")).toBe(false);
  });

  it("reads local wall-clock time", () => {
    expect(instantToPlainTime(new Date("2026-11-10T13:30:00Z"), "America/Chicago")).toBe("07:30");
    expect(instantToPlainTime(new Date("2026-11-10T06:05:00Z"), "UTC")).toBe("06:05");
    expect(instantToPlainTime(new Date("2026-11-10T00:00:00Z"), "UTC")).toBe("00:00");
  });
});

describe("wording", () => {
  it("says what happened, in plain words", () => {
    expect(
      notificationText("NEEDS_REWORK", { choreName: "Dishes", actorName: "Mom", note: "Pans too" }),
    ).toEqual({
      title: "Try again: Dishes",
      body: "Mom says: Pans too",
    });
    expect(notificationText("NEEDS_REWORK", { choreName: "Dishes", actorName: "Mom" }).body).toBe(
      "Mom sent it back for another try.",
    );
    expect(notificationText("SUBMITTED", { choreName: "Dishes", actorName: "Billy" }).title).toBe(
      "Billy handed in Dishes",
    );
    expect(
      notificationText("REDEMPTION_REQUESTED", {
        actorName: "Billy",
        itemName: "Screen time",
        costText: "50 pts",
      }),
    ).toEqual({
      title: "Billy asks for Screen time",
      body: "50 pts. Say yes or not now in Review.",
    });
    expect(
      notificationText("REDEMPTION_DECIDED", { itemName: "Screen time", approved: false }).body,
    ).toBe("Your points are back.");
  });

  it("writes one morning digest, or nothing on an empty day", () => {
    const empty = {
      name: "Billy",
      choresToday: 0,
      toTryAgain: 0,
      waitingForReview: 0,
      rewardRequests: 0,
      updates: 0,
    };
    expect(digestText(empty)).toBeNull();
    expect(digestText({ ...empty, choresToday: 3, toTryAgain: 1, updates: 1 })).toEqual({
      title: "Good morning, Billy!",
      body: "3 chores today · 1 to try again · 1 update",
    });
    expect(
      digestText({ ...empty, name: "Mom", waitingForReview: 2, rewardRequests: 1 })?.body,
    ).toBe("2 waiting for review · 1 reward request");
  });
});
