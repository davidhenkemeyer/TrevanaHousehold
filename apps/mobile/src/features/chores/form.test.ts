import type { Chore } from "@titan/contracts";
import type { PlainDate } from "@titan/domain";
import { describe, expect, it } from "vitest";
import {
  type ChoreForm,
  describeAssignment,
  describeDuration,
  endOfDayMinutes,
  formFromChore,
  minutesToTime,
  newChoreForm,
  toChoreBody,
  toUpdateBody,
  validateChoreForm,
} from "./form";

const TUESDAY = "2026-11-10" as PlainDate;
const BILLY = "11111111-1111-4111-8111-111111111111";
const SALLY = "22222222-2222-4222-8222-222222222222";

function chore(overrides: Partial<Chore> = {}): Chore {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Dishes",
    description: "",
    cue: null,
    kind: "ROUTINE",
    xpOverride: null,
    effortMinutes: 10,
    defaultPriority: "NORMAL",
    requiresPhoto: false,
    reviewPolicy: "REVIEW_EACH",
    rewardAmount: 0,
    recurrence: { freq: "WEEKLY", startDate: "2026-11-10" },
    deadlineMinutes: 24 * 60,
    assignMode: "FIXED",
    eligibleMembershipIds: [BILLY],
    checklist: [{ id: "44444444-4444-4444-8444-444444444444", text: "Rinse" }],
    referencePhotoUrl: null,
    active: true,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

const form = (overrides: Partial<ChoreForm> = {}): ChoreForm => ({
  ...newChoreForm(TUESDAY),
  name: "Dishes",
  ...overrides,
});

describe("toChoreBody", () => {
  it("sends only the recurrence fields the frequency uses", () => {
    const f = form({
      byWeekday: [4, 2],
      monthDay: 31,
      interval: 2,
      endDate: "2026-12-31" as PlainDate,
    });
    expect(toChoreBody({ ...f, freq: "WEEKLY" }).recurrence).toEqual({
      freq: "WEEKLY",
      startDate: TUESDAY,
      interval: 2,
      endDate: "2026-12-31",
      byWeekday: [2, 4],
    });
    expect(toChoreBody({ ...f, freq: "MONTHLY" }).recurrence).toEqual({
      freq: "MONTHLY",
      startDate: TUESDAY,
      interval: 2,
      endDate: "2026-12-31",
      byMonthDay: 31,
    });
    // ONCE allows no interval or end date.
    expect(toChoreBody({ ...f, freq: "ONCE" }).recurrence).toEqual({
      freq: "ONCE",
      startDate: TUESDAY,
    });
  });

  it("trims text, drops blank steps, and treats a blank cue as none", () => {
    const body = toChoreBody(
      form({ name: "  Dishes ", cue: "  ", checklist: ["Rinse", " ", " Dry "] }),
    );
    expect(body).toMatchObject({ name: "Dishes", cue: null, checklist: ["Rinse", "Dry"] });
  });

  it("turns end of day into minutes until midnight", () => {
    expect(toChoreBody(form({ timeOfDay: "16:00" })).deadlineMinutes).toBe(8 * 60);
    expect(toChoreBody(form()).deadlineMinutes).toBe(24 * 60);
    expect(toChoreBody(form({ deadline: { kind: "minutes", minutes: 90 } })).deadlineMinutes).toBe(
      90,
    );
  });
});

describe("formFromChore / toUpdateBody", () => {
  it("fills in the defaults a stored rule leaves implicit", () => {
    const f = formFromChore(chore());
    expect(f.byWeekday).toEqual([2]); // Tuesday, the start date's weekday
    expect(f.monthDay).toBe(10);
    expect(f.deadline).toEqual({ kind: "endOfDay" });
    expect(f.checklist).toEqual(["Rinse"]);
  });

  it("sends nothing when nothing changed, even though the form made defaults explicit", () => {
    expect(toUpdateBody(formFromChore(chore()), chore())).toEqual({});
  });

  it("sends only the changed fields", () => {
    const original = chore();
    const edited = { ...formFromChore(original), name: "Dishes!", byWeekday: [2, 5] };
    expect(toUpdateBody(edited, original)).toEqual({
      name: "Dishes!",
      recurrence: { freq: "WEEKLY", startDate: TUESDAY, byWeekday: [2, 5] },
    });
  });

  it("sends the chore's kind and job-board mode", () => {
    const original = chore();
    const f = formFromChore(original);
    expect(f.kind).toBe("ROUTINE");
    expect(
      toUpdateBody({ ...f, kind: "EXTRA_JOB", assignMode: "OPEN", rewardAmount: 500 }, original),
    ).toEqual({ kind: "EXTRA_JOB", assignMode: "OPEN", rewardAmount: 500 });
    expect(validateChoreForm(form({ assignMode: "OPEN", eligibleMembershipIds: [] }))).toEqual({});
  });

  it("sends reference photo changes", () => {
    const original = chore();
    const f = formFromChore(original);
    expect(
      toUpdateBody({ ...f, referencePhoto: { kind: "new", uploadId: "u1" } }, original),
    ).toEqual({ referencePhotoUploadId: "u1" });
    expect(toUpdateBody({ ...f, referencePhoto: { kind: "remove" } }, original)).toEqual({
      referencePhotoUploadId: null,
    });
    expect(toChoreBody(form({ referencePhoto: { kind: "new", uploadId: "u2" } }))).toMatchObject({
      referencePhotoUploadId: "u2",
    });
    expect(toChoreBody(form())).not.toHaveProperty("referencePhotoUploadId");
  });

  it("keeps a custom deadline when the start time changes", () => {
    const original = chore({ deadlineMinutes: 90 });
    const f = formFromChore(original);
    expect(f.deadline).toEqual({ kind: "minutes", minutes: 90 });
    expect(toUpdateBody({ ...f, timeOfDay: "15:00" }, original)).toEqual({
      recurrence: { freq: "WEEKLY", startDate: TUESDAY, byWeekday: [2], timeOfDay: "15:00" },
    });
  });
});

describe("validateChoreForm", () => {
  it("accepts a complete form", () => {
    expect(validateChoreForm(form())).toEqual({});
  });

  it("reports problems by field, in plain words", () => {
    const errors = validateChoreForm(
      form({
        name: " ",
        assignMode: "FIXED",
        eligibleMembershipIds: [],
        byWeekday: [],
        freq: "WEEKLY",
      }),
    );
    expect(errors.name).toMatch(/name/);
    expect(errors.eligibleMembershipIds).toBe("A FIXED chore needs at least one owner");
    expect(errors.recurrence).toMatch(/weekday/);
  });
});

describe("helpers", () => {
  it("describeDuration", () => {
    expect([45, 60, 180, 1440, 1800, 10080, 20160].map(describeDuration)).toEqual([
      "45 min",
      "1 hour",
      "3 hours",
      "1 day",
      "1 day 6 hours",
      "1 week",
      "2 weeks",
    ]);
  });

  it("times", () => {
    expect(endOfDayMinutes("00:00")).toBe(1440);
    expect(minutesToTime(16 * 60 + 30)).toBe("16:30");
    expect(minutesToTime(-5)).toBe("00:00");
    expect(minutesToTime(24 * 60)).toBe("23:59");
  });

  it("describeAssignment", () => {
    const members = [
      { id: BILLY, displayName: "Billy" },
      { id: SALLY, displayName: "Sally" },
    ];
    expect(
      describeAssignment({ assignMode: "FIXED", eligibleMembershipIds: [BILLY, SALLY] }, members),
    ).toBe("Billy & Sally");
    expect(describeAssignment({ assignMode: "ROTATE", eligibleMembershipIds: [] }, members)).toBe(
      "Takes turns: everyone",
    );
    expect(
      describeAssignment({ assignMode: "AUTO", eligibleMembershipIds: [SALLY] }, members),
    ).toBe("Balanced by capacity (Sally)");
    expect(
      describeAssignment({ assignMode: "FIXED", eligibleMembershipIds: ["gone"] }, members),
    ).toBe("Nobody (owners have left)");
    expect(describeAssignment({ assignMode: "OPEN", eligibleMembershipIds: [] }, members)).toBe(
      "Job board (anyone can claim it)",
    );
  });
});
