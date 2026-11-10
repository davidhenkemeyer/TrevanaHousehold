import { describe, expect, it } from "vitest";
import { parsePlainDate as d } from "./calendar.js";
import { computeInstanceWindow } from "./instanceWindow.js";

const NY = "America/New_York";
const WEEK = 7 * 24 * 60;

describe("computeInstanceWindow", () => {
  it("defaults to local midnight", () => {
    const w = computeInstanceWindow(d("2026-01-15"), undefined, 60, NY);
    expect(w.availableAt.toISOString()).toBe("2026-01-15T05:00:00.000Z");
    expect(w.dueAt.toISOString()).toBe("2026-01-15T06:00:00.000Z");
  });

  it("adds whole days on the local calendar plus leftover minutes", () => {
    const w = computeInstanceWindow(d("2026-01-15"), "09:00", 24 * 60 + 90, NY);
    expect(w.availableAt.toISOString()).toBe("2026-01-15T14:00:00.000Z");
    expect(w.dueAt.toISOString()).toBe("2026-01-16T15:30:00.000Z"); // next day 10:30 EST
  });

  it("keeps a one-week deadline at the same local time across a DST change", () => {
    // Saturday 09:00 EST; DST begins Sunday 2026-03-08.
    const w = computeInstanceWindow(d("2026-03-07"), "09:00", WEEK, NY);
    expect(w.availableAt.toISOString()).toBe("2026-03-07T14:00:00.000Z"); // 09:00 EST
    expect(w.dueAt.toISOString()).toBe("2026-03-14T13:00:00.000Z"); // 09:00 EDT
  });

  it.each([0, -5, 1.5])("rejects a deadline of %d minutes", (minutes) => {
    expect(() => computeInstanceWindow(d("2026-01-15"), "09:00", minutes, NY)).toThrow(RangeError);
  });
});
