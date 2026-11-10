import type { Chore, ChoreList, InstanceList, Member } from "@titan/contracts";
import { describe, expect, it } from "vitest";
import { DEFAULT_CHORE, type Session, useTestApp } from "../../test/harness.js";

describe("chores", () => {
  const t = useTestApp();

  async function setup() {
    const mom = await t.signup({ displayName: "Mom" });
    const family = await t.createFamily(mom);
    const familyId = family.family.id;
    const billy = await t.addChild(mom, familyId, { displayName: "Billy" });
    const momMember = family.members[0] as Member;
    return { mom, familyId, billy, momMember };
  }

  async function instances(session: Session, familyId: string) {
    const res = await t.request(
      "GET",
      `/v1/families/${familyId}/instances?from=2026-11-01&to=2026-11-30`,
      { session },
    );
    expect(res.statusCode).toBe(200);
    return res.json<InstanceList>().items;
  }

  describe("creating", () => {
    it("stores the chore with defaults and its checklist", async () => {
      const { mom, familyId } = await setup();
      const chore = await t.createChore(mom, familyId, {
        name: "Clean Bedroom Closet",
        checklist: ["Nothing on the floor", "Bins on the shelf", "Clothes hung by type"],
        rewardAmount: 500,
      });
      expect(chore).toMatchObject({
        name: "Clean Bedroom Closet",
        description: "",
        defaultPriority: "NORMAL",
        requiresPhoto: false,
        reviewPolicy: "REVIEW_EACH",
        rewardAmount: 500,
        active: true,
        recurrence: DEFAULT_CHORE.recurrence,
      });
      expect(chore.checklist.map((i) => i.text)).toEqual([
        "Nothing on the floor",
        "Bins on the shelf",
        "Clothes hung by type",
      ]);
    });

    it("plans the next 7 days immediately", async () => {
      const { mom, familyId } = await setup();
      await t.createChore(mom, familyId);
      const items = await instances(mom, familyId);
      expect(items.map((i) => i.occurrenceDate)).toEqual([
        "2026-11-10",
        "2026-11-11",
        "2026-11-12",
        "2026-11-13",
        "2026-11-14",
        "2026-11-15",
        "2026-11-16",
      ]);
      expect(items.every((i) => i.assignees.length === 1 && i.status === "NEW")).toBe(true);
    });

    it("supports one-time chores", async () => {
      const { mom, familyId } = await setup();
      await t.createChore(mom, familyId, {
        name: "Clean the garage",
        recurrence: { freq: "ONCE", startDate: "2026-11-14" },
      });
      expect((await instances(mom, familyId)).map((i) => i.occurrenceDate)).toEqual(["2026-11-14"]);
    });

    it.each([
      [
        "an invalid recurrence",
        { recurrence: { freq: "MONTHLY", startDate: "2026-11-10", byMonthDay: 40 } },
      ],
      ["a FIXED chore without owners", { assignMode: "FIXED", eligibleMembershipIds: [] }],
      ["zero effort", { effortMinutes: 0 }],
      [
        "too many checklist items",
        { checklist: Array.from({ length: 21 }, (_, i) => `Step ${i}`) },
      ],
    ])("rejects %s", async (_label, body) => {
      const { mom, familyId } = await setup();
      const res = await t.request("POST", `/v1/families/${familyId}/chores`, {
        session: mom,
        body: { ...DEFAULT_CHORE, ...body },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects owners who aren't in the family", async () => {
      const { mom, familyId } = await setup();
      const other = await t.signup();
      const outsider = (await t.createFamily(other)).members[0] as Member;
      const res = await t.request("POST", `/v1/families/${familyId}/chores`, {
        session: mom,
        body: { ...DEFAULT_CHORE, assignMode: "FIXED", eligibleMembershipIds: [outsider.id] },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("UNKNOWN_MEMBER");
    });
  });

  describe("access", () => {
    it("kids can read chores but not change them", async () => {
      const { mom, familyId, billy } = await setup();
      const chore = await t.createChore(mom, familyId);
      const kid = await t.switchTo(mom, familyId, billy.id);

      const list = await t.request("GET", `/v1/families/${familyId}/chores`, { session: kid });
      expect(list.json<ChoreList>().chores.map((c) => c.id)).toEqual([chore.id]);

      const create = await t.request("POST", `/v1/families/${familyId}/chores`, {
        session: kid,
        body: DEFAULT_CHORE,
      });
      expect(create.statusCode).toBe(403);
      const edit = await t.request("PATCH", `/v1/families/${familyId}/chores/${chore.id}`, {
        session: kid,
        body: { rewardAmount: 1_000_000 },
      });
      expect(edit.statusCode).toBe(403);
    });
  });

  describe("editing", () => {
    it("re-plans only untouched future occurrences", async () => {
      const { mom, familyId, momMember } = await setup();
      const chore = await t.createChore(mom, familyId, {
        assignMode: "FIXED",
        eligibleMembershipIds: [momMember.id],
      });
      const today = (await instances(mom, familyId))[0];
      await t.request("POST", `/v1/families/${familyId}/instances/${today?.id}/actions`, {
        session: mom,
        body: { action: "start" },
      });

      const res = await t.request("PATCH", `/v1/families/${familyId}/chores/${chore.id}`, {
        session: mom,
        body: { effortMinutes: 25, checklist: ["Rinse", "Load"] },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<Chore>().checklist.map((i) => i.text)).toEqual(["Rinse", "Load"]);

      const after = await instances(mom, familyId);
      expect(after).toHaveLength(7);
      // The started one keeps its original effort; the rest were re-planned.
      expect(after[0]).toMatchObject({ id: today?.id, status: "IN_PROGRESS", effortMinutes: 10 });
      expect(after.slice(1).every((i) => i.effortMinutes === 25)).toBe(true);
    });

    it("leaves the schedule alone for a rename", async () => {
      const { mom, familyId } = await setup();
      const chore = await t.createChore(mom, familyId);
      const before = (await instances(mom, familyId)).map((i) => i.id);
      await t.request("PATCH", `/v1/families/${familyId}/chores/${chore.id}`, {
        session: mom,
        body: { name: "Do the dishes" },
      });
      const after = await instances(mom, familyId);
      expect(after.map((i) => i.id)).toEqual(before);
      expect(after[0]?.choreName).toBe("Do the dishes");
    });

    it("refuses to make a chore FIXED with no owners", async () => {
      const { mom, familyId } = await setup();
      const chore = await t.createChore(mom, familyId);
      const res = await t.request("PATCH", `/v1/families/${familyId}/chores/${chore.id}`, {
        session: mom,
        body: { assignMode: "FIXED" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("FIXED_NEEDS_OWNER");
    });
  });

  describe("archiving", () => {
    it("stops the chore and removes untouched upcoming occurrences, keeping history", async () => {
      const { mom, familyId } = await setup();
      const chore = await t.createChore(mom, familyId);
      const [today] = await instances(mom, familyId);
      await t.request("POST", `/v1/families/${familyId}/instances/${today?.id}/actions`, {
        session: mom,
        body: { action: "start" },
      });

      const res = await t.request("DELETE", `/v1/families/${familyId}/chores/${chore.id}`, {
        session: mom,
      });
      expect(res.statusCode).toBe(204);
      expect((await instances(mom, familyId)).map((i) => i.id)).toEqual([today?.id]);

      const active = await t.request("GET", `/v1/families/${familyId}/chores`, { session: mom });
      expect(active.json<ChoreList>().chores).toEqual([]);
      const all = await t.request("GET", `/v1/families/${familyId}/chores?includeArchived=true`, {
        session: mom,
      });
      expect(all.json<ChoreList>().chores[0]).toMatchObject({ id: chore.id, active: false });
    });
  });
});
