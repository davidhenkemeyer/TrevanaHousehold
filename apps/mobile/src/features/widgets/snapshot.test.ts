import type { Instance } from "@tenara/contracts";
import { describe, expect, it } from "vitest";
import { buildWidgetSnapshot, parseWidgetSnapshot, widgetText } from "./snapshot";

const BILLY = "11111111-1111-4111-8111-111111111111";
const MOM = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-11-10T15:00:00.000Z");

function item(overrides: Partial<Instance>): Instance {
  return {
    id: crypto.randomUUID(),
    choreId: crypto.randomUUID(),
    choreName: "Dishes",
    description: "",
    cue: null,
    occurrenceDate: "2026-11-10" as Instance["occurrenceDate"],
    availableAt: "2026-11-10T06:00:00.000Z",
    dueAt: "2026-11-11T00:00:00.000Z",
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

const momChore = { membershipId: MOM, displayName: "Mom", avatarColor: "#DB2777" };

describe("widget snapshot", () => {
  const items = [
    item({ choreName: "Feed the fish" }),
    item({ choreName: "Make bed", status: "APPROVED" }),
    item({ choreName: "Tidy room", status: "NEEDS_REWORK" }),
    item({ choreName: "Set table", status: "PENDING_REVIEW" }),
    item({ choreName: "Laundry", isLate: true }),
    item({ choreName: "Walk dog" }),
    item({ choreName: "Mom's chore", assignees: [momChore] }),
  ];

  it("counts a kid's own chores and lists the most urgent first", () => {
    const s = buildWidgetSnapshot({
      items,
      viewerMembershipId: BILLY,
      name: "Billy Tester",
      role: "CHILD",
      widgetsAllowed: true,
      now,
    });
    expect(s).toMatchObject({ name: "Billy", locked: false, left: 4, done: 2, total: 6 });
    expect(s.next.map((n) => n.name)).toEqual(["Tidy room", "Laundry", "Feed the fish"]);
    expect(s.waiting).toBeNull();
    expect(widgetText(s)).toEqual({ title: "Billy: 4 left today", subtitle: "2 of 6 done" });
  });

  it("tells a parent how many chores wait for review", () => {
    const s = buildWidgetSnapshot({
      items,
      viewerMembershipId: MOM,
      name: "Mom",
      role: "PARENT",
      widgetsAllowed: true,
      now,
    });
    expect(s).toMatchObject({ left: 1, waiting: 1 });
    expect(widgetText(s).subtitle).toBe("0 of 1 done · 1 to review");
  });

  it("celebrates an empty list and says so when widgets aren't included", () => {
    const allDone = buildWidgetSnapshot({
      items: [item({ status: "APPROVED" })],
      viewerMembershipId: BILLY,
      name: "Billy",
      role: "CHILD",
      widgetsAllowed: true,
      now,
    });
    expect(widgetText(allDone).title).toBe("All done, Billy!");
    const locked = { ...allDone, locked: true };
    expect(widgetText(locked)).toEqual({
      title: "Tenara",
      subtitle: "Widgets are part of Tenara Pro.",
    });
  });

  it("reads back only snapshots it understands", () => {
    const s = buildWidgetSnapshot({
      items: [],
      viewerMembershipId: BILLY,
      name: "Billy",
      role: "CHILD",
      widgetsAllowed: true,
      now,
    });
    expect(parseWidgetSnapshot(JSON.stringify(s))).toEqual(s);
    expect(parseWidgetSnapshot(JSON.stringify({ ...s, v: 2 }))).toBeNull();
    expect(parseWidgetSnapshot("not json")).toBeNull();
    expect(parseWidgetSnapshot(null)).toBeNull();
    expect(widgetText(s).subtitle).toBe("Nothing due today");
  });
});
