import type {
  AddStarterChoresResult,
  ChoreList,
  InstanceList,
  Member,
  StarterChoreList,
} from "@tenara/contracts";
import { describe, expect, it } from "vitest";
import { useTestApp } from "../../test/harness.js";

describe("starter chores", () => {
  const t = useTestApp();

  async function setup() {
    const mom = await t.signup({ displayName: "Mom" });
    const family = await t.createFamily(mom);
    const familyId = family.family.id;
    const momMember = family.members[0] as Member;
    return { mom, familyId, momMember };
  }

  const list = async (session: Awaited<ReturnType<typeof setup>>["mom"], familyId: string) => {
    const res = await t.request("GET", `/v1/families/${familyId}/starter-chores`, { session });
    expect(res.statusCode).toBe(200);
    return res.json<StarterChoreList>();
  };

  const add = (
    session: Awaited<ReturnType<typeof setup>>["mom"],
    familyId: string,
    templateIds: string[],
  ) =>
    t.request("POST", `/v1/families/${familyId}/starter-chores`, {
      session,
      body: { templateIds },
    });

  it("lists every room, suggests by age, and marks what's added", async () => {
    const { mom, familyId } = await setup();
    await t.addChild(mom, familyId, { displayName: "Sally", ageGroup: "LITTLE" });

    const before = await list(mom, familyId);
    expect(before.rooms.map((r) => r.room)).toEqual([
      "EVERYDAY",
      "KITCHEN",
      "BATHROOM",
      "BEDROOM",
      "LIVING_ROOM",
      "LAUNDRY",
      "OUTDOOR",
      "PETS",
    ]);
    const kitchen = before.rooms.find((r) => r.room === "KITCHEN")?.chores ?? [];
    const dishwasher = kitchen.find((c) => c.id === "load-dishwasher");
    expect(dishwasher).toMatchObject({
      howOften: "Every day from 6:30 PM",
      minAge: "KID",
      minAgeLabel: "Ages 7+",
      // The only kid is 4–6, so it isn't ticked by default.
      suggested: false,
      added: false,
    });
    const bed = before.rooms[0]?.chores.find((c) => c.id === "make-bed");
    expect(bed).toMatchObject({ suggested: true, cue: "After you get up", timeOfDay: "07:00" });

    expect((await add(mom, familyId, ["make-bed"])).statusCode).toBe(201);
    const after = await list(mom, familyId);
    expect(after.rooms[0]?.chores.find((c) => c.id === "make-bed")?.added).toBe(true);
  });

  it("adds chores as AUTO, pooled to members old enough, and plans them", async () => {
    const { mom, familyId, momMember } = await setup();
    const little = await t.addChild(mom, familyId, { displayName: "Sally", ageGroup: "LITTLE" });
    const tween = await t.addChild(mom, familyId, { displayName: "Billy", ageGroup: "TWEEN" });
    expect(little.capacity).toMatchObject({ mon: 10, sat: 20 });
    expect(tween.ageGroup).toBe("TWEEN");

    const res = await add(mom, familyId, ["make-bed", "clean-toilet", "clean-fridge"]);
    expect(res.statusCode).toBe(201);
    const { chores, skipped } = res.json<AddStarterChoresResult>();
    expect(skipped).toEqual([]);
    const [bed, toilet, fridge] = chores;
    expect(bed).toMatchObject({
      name: "Make your bed",
      templateId: "make-bed",
      assignMode: "AUTO",
      eligibleMembershipIds: [], // everyone can
      deadlineMinutes: 17 * 60,
      recurrence: { freq: "DAILY", startDate: "2026-11-10", timeOfDay: "07:00" },
    });
    // Toilets are for 11+: Mom and Billy, not Sally.
    expect(toilet?.eligibleMembershipIds).toEqual([momMember.id, tween.id]);
    expect(toilet?.checklist.map((i) => i.text)).toEqual([
      "Bowl",
      "Seat and lid",
      "Outside and base",
    ]);
    expect(fridge?.recurrence).toMatchObject({ freq: "MONTHLY", byMonthDay: 1 });

    const planned = await t.request(
      "GET",
      `/v1/families/${familyId}/instances?from=2026-11-10&to=2026-11-16`,
      { session: mom },
    );
    const items = planned.json<InstanceList>().items;
    expect(items.filter((i) => i.choreName === "Make your bed")).toHaveLength(7);
    for (const toiletDay of items.filter((i) => i.choreName === "Clean the toilet")) {
      expect(toiletDay.assignees.map((a) => a.membershipId)).not.toContain(little.id);
    }
  });

  it("skips templates the family already has, so setup can be repeated safely", async () => {
    const { mom, familyId } = await setup();
    await add(mom, familyId, ["make-bed"]);
    const again = await add(mom, familyId, ["make-bed", "set-table"]);
    const result = again.json<AddStarterChoresResult>();
    expect(result.skipped).toEqual(["make-bed"]);
    expect(result.chores.map((c) => c.templateId)).toEqual(["set-table"]);
    const all = await t.request("GET", `/v1/families/${familyId}/chores`, { session: mom });
    expect(all.json<ChoreList>().chores).toHaveLength(2);
  });

  it("rejects unknown templates and repeats, and changes nothing", async () => {
    const { mom, familyId } = await setup();
    const unknown = await add(mom, familyId, ["make-bed", "juggle-chainsaws"]);
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json()).toMatchObject({ error: { code: "UNKNOWN_TEMPLATE" } });
    expect((await add(mom, familyId, ["make-bed", "make-bed"])).statusCode).toBe(400);
    expect((await add(mom, familyId, [])).statusCode).toBe(400);
    const all = await t.request("GET", `/v1/families/${familyId}/chores`, { session: mom });
    expect(all.json<ChoreList>().chores).toHaveLength(0);
  });

  it("is for parents only; non-members get 404", async () => {
    const { mom, familyId } = await setup();
    const billy = await t.addChild(mom, familyId, { displayName: "Billy" });
    const kid = await t.switchTo(mom, familyId, billy.id);
    expect((await add(kid, familyId, ["make-bed"])).statusCode).toBe(403);
    const stranger = await t.signup({ email: "stranger@example.com" });
    expect((await add(stranger, familyId, ["make-bed"])).statusCode).toBe(404);
    const res = await t.request("GET", `/v1/families/${familyId}/starter-chores`, {
      session: stranger,
    });
    expect(res.statusCode).toBe(404);
  });

  it("lets a parent set and clear a kid's age group", async () => {
    const { mom, familyId } = await setup();
    const billy = await t.addChild(mom, familyId, { displayName: "Billy" });
    expect(billy.ageGroup).toBeNull();
    const set = await t.request("PATCH", `/v1/families/${familyId}/members/${billy.id}`, {
      session: mom,
      body: { ageGroup: "TEEN" },
    });
    expect(set.json<Member>().ageGroup).toBe("TEEN");
    // Capacity isn't changed by setting an age group later.
    expect(set.json<Member>().capacity).toEqual(billy.capacity);
    const cleared = await t.request("PATCH", `/v1/families/${familyId}/members/${billy.id}`, {
      session: mom,
      body: { ageGroup: null },
    });
    expect(cleared.json<Member>().ageGroup).toBeNull();
  });
});
