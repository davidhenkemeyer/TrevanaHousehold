import { describe, expect, it } from "vitest";
import { effectivePriority, shouldMarkLate } from "./lateness.js";
import type { ChoreStatus } from "./status.js";

const dueAt = new Date("2026-11-10T17:00:00Z");
const after = new Date("2026-11-10T17:00:01Z");

describe("shouldMarkLate", () => {
  it.each<ChoreStatus>(["NEW", "IN_PROGRESS", "DEFERRED", "NEEDS_REWORK"])(
    "marks an overdue %s chore late",
    (status) => {
      expect(shouldMarkLate({ status, isLate: false, dueAt }, after)).toBe(true);
    },
  );

  it.each<ChoreStatus>(["PENDING_REVIEW", "APPROVED", "REJECTED", "CANCELED"])(
    "never marks %s late",
    (status) => {
      expect(shouldMarkLate({ status, isLate: false, dueAt }, after)).toBe(false);
    },
  );

  it("is not late exactly at the deadline", () => {
    expect(shouldMarkLate({ status: "NEW", isLate: false, dueAt }, dueAt)).toBe(false);
  });

  it("does not re-flag an instance that is already late", () => {
    expect(shouldMarkLate({ status: "NEW", isLate: true, dueAt }, after)).toBe(false);
  });
});

describe("effectivePriority", () => {
  it("keeps the stored priority normally", () => {
    expect(effectivePriority("LOW", "NEW", false)).toBe("LOW");
  });

  it("forces HIGH when late or sent back for rework", () => {
    expect(effectivePriority("LOW", "IN_PROGRESS", true)).toBe("HIGH");
    expect(effectivePriority("NORMAL", "NEEDS_REWORK", false)).toBe("HIGH");
  });
});
