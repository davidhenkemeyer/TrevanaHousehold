import type { Instance } from "@titan/contracts";
import { describe, expect, it } from "vitest";
import { buildSections, dayProgress, defaultScope, dueLabel, sectionOf } from "./sections";

const BILLY = "11111111-1111-4111-8111-111111111111";
const SALLY = "22222222-2222-4222-8222-222222222222";

function item(overrides: Partial<Instance>): Instance {
  return {
    id: crypto.randomUUID(),
    choreId: crypto.randomUUID(),
    choreName: "Dishes",
    description: "",
    cue: null,
    occurrenceDate: "2026-11-10" as Instance["occurrenceDate"],
    availableAt: "2026-11-10T06:00:00.000Z",
    dueAt: "2026-11-10T18:00:00.000Z",
    status: "NEW",
    isLate: false,
    kind: "ROUTINE",
    board: "NONE",
    priority: "NORMAL",
    effortMinutes: 10,
    rewardAmount: 0,
    xp: 10,
    requiresPhoto: false,
    referencePhotoUrl: null,
    reviewPolicy: "REVIEW_EACH",
    checklist: [],
    assignees: [{ membershipId: BILLY, displayName: "Billy", avatarColor: "#2563EB" }],
    availableActions: [],
    latestReview: null,
    ...overrides,
  };
}

describe("sectionOf", () => {
  it.each<[Partial<Instance>, string | null]>([
    [{ status: "NEW" }, "todo"],
    [{ status: "IN_PROGRESS" }, "todo"],
    [{ status: "DEFERRED" }, "todo"],
    [{ status: "NEW", isLate: true }, "attention"],
    [{ status: "NEEDS_REWORK" }, "attention"],
    [{ status: "PENDING_REVIEW", isLate: true }, "review"], // finished on time is what counts
    [{ status: "APPROVED" }, "done"],
    [{ status: "REJECTED" }, null],
    [{ status: "CANCELED" }, null],
  ])("%o → %s", (overrides, expected) => {
    expect(sectionOf(item(overrides))).toBe(expected);
  });
});

describe("buildSections", () => {
  const items = [
    item({ choreName: "Late dishes", status: "NEW", isLate: true }),
    item({ choreName: "Laundry" }),
    item({
      choreName: "Feed fish",
      assignees: [{ membershipId: SALLY, displayName: "Sally", avatarColor: "#DB2777" }],
    }),
    item({ choreName: "Make bed", status: "APPROVED" }),
  ];

  it("shows only the viewer's chores in 'mine', in section order, skipping empty sections", () => {
    const sections = buildSections(items, { viewerMembershipId: BILLY, scope: "mine" });
    expect(sections.map((s) => [s.key, s.items.map((i) => i.choreName)])).toEqual([
      ["attention", ["Late dishes"]],
      ["todo", ["Laundry"]],
      ["done", ["Make bed"]],
    ]);
  });

  it("shows everyone's chores in 'family'", () => {
    const sections = buildSections(items, { viewerMembershipId: BILLY, scope: "family" });
    expect(sections.find((s) => s.key === "todo")?.items.map((i) => i.choreName)).toEqual([
      "Laundry",
      "Feed fish",
    ]);
  });

  it("counts submitted and approved chores as done for the day's progress", () => {
    const sections = buildSections([...items, item({ status: "PENDING_REVIEW" })], {
      viewerMembershipId: BILLY,
      scope: "mine",
    });
    expect(dayProgress(sections)).toEqual({ done: 2, total: 4 });
  });
});

describe("dueLabel", () => {
  // Local-time dates, so the test means the same thing in any time zone.
  const now = new Date(2026, 10, 10, 9, 0); // Tue Nov 10, 9:00

  it("reads a midnight deadline as the end of the previous day", () => {
    expect(dueLabel(new Date(2026, 10, 11, 0, 0).toISOString(), now)).toBe("Due today");
    expect(dueLabel(new Date(2026, 10, 12, 0, 0).toISOString(), now)).toBe("Due tomorrow");
  });

  it("shows the time for other deadlines", () => {
    expect(dueLabel(new Date(2026, 10, 10, 18, 0).toISOString(), now)).toMatch(/^Due 6:00/);
    expect(dueLabel(new Date(2026, 10, 11, 18, 0).toISOString(), now)).toMatch(
      /^Due tomorrow 6:00/,
    );
  });

  it("says yesterday for an overdue chore from the day before", () => {
    expect(dueLabel(new Date(2026, 10, 10, 0, 0).toISOString(), now)).toBe("Due yesterday");
  });
});

describe("defaultScope", () => {
  it("starts kids on their own chores and parents on the family's", () => {
    expect(defaultScope("CHILD")).toBe("mine");
    expect(defaultScope("PARENT")).toBe("family");
  });
});
