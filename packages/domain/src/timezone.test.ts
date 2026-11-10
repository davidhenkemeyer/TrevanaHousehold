import { describe, expect, it } from "vitest";
import { parsePlainDate as d } from "./calendar.js";
import {
  instantToPlainDate,
  isPlainTime,
  isValidTimeZone,
  parsePlainTime,
  zonedDateTimeToInstant,
} from "./timezone.js";

const NY = "America/New_York";

describe("plain times", () => {
  it("parses HH:MM", () => {
    expect(parsePlainTime("07:05")).toEqual({ hour: 7, minute: 5 });
    expect(isPlainTime("23:59")).toBe(true);
  });

  it.each(["24:00", "7:05", "12:60", "", "noon"])("rejects %j", (value) => {
    expect(isPlainTime(value)).toBe(false);
    expect(() => parsePlainTime(value)).toThrow(RangeError);
  });
});

describe("time zone validation", () => {
  it("accepts IANA zones and rejects junk", () => {
    expect(isValidTimeZone("America/Chicago")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
  });
});

describe("zonedDateTimeToInstant", () => {
  it("converts ordinary local times", () => {
    expect(zonedDateTimeToInstant(d("2026-01-15"), "09:00", NY).toISOString()).toBe(
      "2026-01-15T14:00:00.000Z", // EST, UTC-5
    );
    expect(zonedDateTimeToInstant(d("2026-07-15"), "09:00", NY).toISOString()).toBe(
      "2026-07-15T13:00:00.000Z", // EDT, UTC-4
    );
    expect(zonedDateTimeToInstant(d("2026-06-01"), "09:00", "Asia/Kolkata").toISOString()).toBe(
      "2026-06-01T03:30:00.000Z", // half-hour offset
    );
    expect(zonedDateTimeToInstant(d("2026-06-01"), "00:00", "UTC").toISOString()).toBe(
      "2026-06-01T00:00:00.000Z",
    );
  });

  it("handles the southern hemisphere (summer DST in January)", () => {
    expect(zonedDateTimeToInstant(d("2026-01-15"), "09:00", "Pacific/Auckland").toISOString()).toBe(
      "2026-01-14T20:00:00.000Z", // NZDT, UTC+13: the previous UTC day
    );
  });

  it("shifts a nonexistent spring-forward time ahead by the gap", () => {
    // 2026-03-08 02:30 doesn't exist in New York; clocks jump 02:00 → 03:00.
    expect(zonedDateTimeToInstant(d("2026-03-08"), "02:30", NY).toISOString()).toBe(
      "2026-03-08T07:30:00.000Z", // = 03:30 EDT
    );
  });

  it("picks the earlier instant for an ambiguous fall-back time", () => {
    // 2026-11-01 01:30 happens twice in New York (EDT, then EST).
    expect(zonedDateTimeToInstant(d("2026-11-01"), "01:30", NY).toISOString()).toBe(
      "2026-11-01T05:30:00.000Z", // the EDT one
    );
  });

  it("handles times right around a transition", () => {
    expect(zonedDateTimeToInstant(d("2026-03-08"), "01:59", NY).toISOString()).toBe(
      "2026-03-08T06:59:00.000Z",
    );
    expect(zonedDateTimeToInstant(d("2026-03-08"), "03:00", NY).toISOString()).toBe(
      "2026-03-08T07:00:00.000Z",
    );
  });

  it("round-trips back to the same local date", () => {
    for (const zone of [NY, "Europe/London", "Asia/Kolkata", "Pacific/Auckland"]) {
      const instant = zonedDateTimeToInstant(d("2026-03-29"), "23:45", zone);
      expect(instantToPlainDate(instant, zone)).toBe("2026-03-29");
    }
  });
});

describe("instantToPlainDate", () => {
  it("returns the local calendar date, which can differ from the UTC date", () => {
    const instant = new Date("2026-11-10T03:00:00Z");
    expect(instantToPlainDate(instant, "America/Los_Angeles")).toBe("2026-11-09");
    expect(instantToPlainDate(instant, "UTC")).toBe("2026-11-10");
    expect(instantToPlainDate(instant, "Asia/Tokyo")).toBe("2026-11-10");
  });
});
