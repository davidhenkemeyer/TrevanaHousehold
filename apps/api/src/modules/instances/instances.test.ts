import type {
  Instance,
  InstanceDetail,
  InstanceList,
  Member,
  SubmitResponse,
} from "@titan/contracts";
import { describe, expect, it } from "vitest";
import { T0, type Session, minutes, useTestApp } from "../../test/harness.js";
import { planFamily } from "./generate.js";

describe("chore instances", () => {
  const t = useTestApp();

  /** Mom, Billy, and Sally. T0 is Tuesday 2026-11-10, 06:00 in Chicago. */
  async function setup() {
    const mom = await t.signup({ displayName: "Mom" });
    const family = await t.createFamily(mom);
    const familyId = family.family.id;
    const momMember = family.members[0] as Member;
    const billy = await t.addChild(mom, familyId, { displayName: "Billy" });
    const sally = await t.addChild(mom, familyId, { displayName: "Sally" });
    const billySession = await t.switchTo(mom, familyId, billy.id);
    const sallySession = await t.switchTo(mom, familyId, sally.id);
    return { mom, familyId, momMember, billy, sally, billySession, sallySession };
  }

  async function list(session: Session, familyId: string, query = "") {
    const res = await t.request(
      "GET",
      `/v1/families/${familyId}/instances?from=2026-11-01&to=2026-11-30${query}`,
      { session },
    );
    expect(res.statusCode).toBe(200);
    return res.json<InstanceList>().items;
  }

  const act = (session: Session, familyId: string, id: string, action: string) =>
    t.request("POST", `/v1/families/${familyId}/instances/${id}/actions`, {
      session,
      body: { action },
    });

  const submit = (session: Session, familyId: string, id: string, checklist: object[] = []) =>
    t.request("POST", `/v1/families/${familyId}/instances/${id}/submissions`, {
      session,
      body: { checklist },
    });

  /** A daily chore owned by one member; returns today's occurrence. */
  async function choreFor(parent: Session, familyId: string, owner: Member, extra = {}) {
    await t.createChore(parent, familyId, {
      assignMode: "FIXED",
      eligibleMembershipIds: [owner.id],
      ...extra,
    });
    const today = (await t.agenda(parent, familyId)).items[0];
    if (!today) throw new Error("expected an occurrence today");
    return today;
  }

  describe("planning", () => {
    it("spreads AUTO chores in proportion to capacity", async () => {
      const { mom, familyId, momMember, billy, sally } = await setup();
      // Sally is away this week, so it's Mom (60 min/day) and Billy (20 on school days).
      await t.request("PATCH", `/v1/families/${familyId}/members/${sally.id}`, {
        session: mom,
        body: { capacity: { sun: 0, mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0 } },
      });
      for (const name of ["Dishes", "Laundry", "Sweep", "Trash"]) {
        await t.createChore(mom, familyId, { name });
      }
      // Plan all four together, as the nightly run would.
      await t.request("POST", `/v1/families/${familyId}/schedule/replan`, { session: mom });

      const tuesday = await list(mom, familyId, "&status=NEW");
      const minutesFor = (memberId: string) =>
        tuesday
          .filter((i) => i.occurrenceDate === "2026-11-10")
          .filter((i) => i.assignees.some((a) => a.membershipId === memberId))
          .reduce((sum, i) => sum + i.effortMinutes, 0);
      expect(minutesFor(momMember.id)).toBe(30);
      expect(minutesFor(billy.id)).toBe(10);
      expect(minutesFor(sally.id)).toBe(0);
    });

    it("rotates ROTATE chores through the pool", async () => {
      const { mom, familyId, billy, sally } = await setup();
      await t.createChore(mom, familyId, {
        name: "Feed the dog",
        assignMode: "ROTATE",
        eligibleMembershipIds: [billy.id, sally.id],
      });
      const names = (await list(mom, familyId)).map((i) => i.assignees[0]?.displayName);
      expect(names).toEqual(["Billy", "Sally", "Billy", "Sally", "Billy", "Sally", "Billy"]);
    });

    it("never plans the same date twice", async () => {
      const { mom, familyId } = await setup();
      await t.createChore(mom, familyId);
      const again = await planFamily(t.db, familyId, T0);
      expect(again.created).toBe(0);
      expect(await list(mom, familyId)).toHaveLength(7);
    });

    it("uses the family's time zone to decide what 'today' is", async () => {
      const { mom, familyId } = await setup();
      await t.createChore(mom, familyId);
      // 05:30 UTC on Nov 11 is still 23:30 on Nov 10 in Chicago.
      t.advance(minutes(17 * 60 + 30));
      const late = await t.refresh(mom);
      expect((await t.agenda(late, familyId)).date).toBe("2026-11-10");
      t.advance(minutes(60));
      const later = await t.refresh(late); // refresh tokens are single-use: chain them
      expect((await t.agenda(later, familyId)).date).toBe("2026-11-11");
    });

    it("gives a removed member's upcoming chores to someone else", async () => {
      const { mom, familyId, billy } = await setup();
      await t.createChore(mom, familyId, { assignMode: "ROTATE" });
      expect(
        (await list(mom, familyId)).some((i) => i.assignees[0]?.membershipId === billy.id),
      ).toBe(true);
      await t.request("DELETE", `/v1/families/${familyId}/members/${billy.id}`, { session: mom });
      const after = await list(mom, familyId);
      expect(after).toHaveLength(7);
      expect(after.some((i) => i.assignees.some((a) => a.membershipId === billy.id))).toBe(false);
    });
  });

  describe("kid actions", () => {
    it("start, defer, and reset follow the rules", async () => {
      const { mom, familyId, billy, billySession } = await setup();
      const today = await choreFor(mom, familyId, billy);
      expect(today.availableActions).toEqual(["start", "defer", "complete", "cancel"]); // Mom's view

      const started = await act(billySession, familyId, today.id, "start");
      expect(started.statusCode).toBe(200);
      expect(started.json<Instance>()).toMatchObject({
        status: "IN_PROGRESS",
        availableActions: ["reset", "complete"],
      });
      expect((await act(billySession, familyId, today.id, "start")).statusCode).toBe(409);
      expect((await act(billySession, familyId, today.id, "reset")).json().status).toBe("NEW");
      expect((await act(billySession, familyId, today.id, "defer")).json().status).toBe("DEFERRED");
    });

    it("a sibling can't act on someone else's chore", async () => {
      const { mom, familyId, billy, sallySession } = await setup();
      const today = await choreFor(mom, familyId, billy);
      const res = await act(sallySession, familyId, today.id, "start");
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("FORBIDDEN");
    });

    it("only parents can cancel", async () => {
      const { mom, familyId, billy, billySession } = await setup();
      const today = await choreFor(mom, familyId, billy);
      expect((await act(billySession, familyId, today.id, "cancel")).statusCode).toBe(403);
      expect((await act(mom, familyId, today.id, "cancel")).json().status).toBe("CANCELED");
    });

    it("two simultaneous actions can't both win", async () => {
      const { mom, familyId, billy, billySession } = await setup();
      const today = await choreFor(mom, familyId, billy);
      const results = await Promise.all([
        act(billySession, familyId, today.id, "start"),
        act(mom, familyId, today.id, "cancel"),
      ]);
      const codes = results.map((r) => r.statusCode).sort();
      expect(codes).toEqual([200, 409]);
    });

    it("records every status change in the history", async () => {
      const { mom, familyId, billy, billySession } = await setup();
      const today = await choreFor(mom, familyId, billy);
      await act(billySession, familyId, today.id, "start");
      await act(billySession, familyId, today.id, "reset");
      const detail = await t.request("GET", `/v1/families/${familyId}/instances/${today.id}`, {
        session: mom,
      });
      expect(
        detail
          .json<InstanceDetail>()
          .events.map((e) => [e.action, e.toStatus, e.actor?.displayName]),
      ).toEqual([
        ["start", "IN_PROGRESS", "Billy"],
        ["reset", "NEW", "Billy"],
      ]);
    });
  });

  describe("submitting", () => {
    it("accepts a partial checklist and summarizes it", async () => {
      const { mom, familyId, billy, billySession } = await setup();
      const today = await choreFor(mom, familyId, billy, {
        checklist: ["Nothing on the floor", "Bins on the shelf", "Clothes hung by type"],
      });
      const [a, b] = today.checklist;
      const res = await submit(billySession, familyId, today.id, [
        { itemId: a?.id, checked: true },
        { itemId: b?.id, checked: true },
      ]);
      expect(res.statusCode).toBe(201);
      const body = res.json<SubmitResponse>();
      expect(body.instance.status).toBe("PENDING_REVIEW");
      expect(body.submission.checklistSummary).toEqual({ checked: 2, total: 3 });
      expect(body.submission.checklist.map((i) => i.checked)).toEqual([true, true, false]);
    });

    it("rejects checklist items that aren't on the chore", async () => {
      const { mom, familyId, billy, billySession } = await setup();
      const today = await choreFor(mom, familyId, billy, { checklist: ["Rinse"] });
      const res = await submit(billySession, familyId, today.id, [
        { itemId: "00000000-0000-4000-8000-000000000000", checked: true },
      ]);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("UNKNOWN_CHECKLIST_ITEM");
    });

    it("requires a photo from kids when the chore says so", async () => {
      const { mom, familyId, billy, billySession } = await setup();
      const today = await choreFor(mom, familyId, billy, { requiresPhoto: true });
      const res = await submit(billySession, familyId, today.id);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("PHOTO_REQUIRED");
    });

    it("a parent's completion is approved on the spot", async () => {
      const { mom, familyId, billy } = await setup();
      const today = await choreFor(mom, familyId, billy, { requiresPhoto: true });
      const body = (await submit(mom, familyId, today.id)).json<SubmitResponse>();
      expect(body.instance.status).toBe("APPROVED");
      expect(body.submission.reviews).toEqual([
        expect.objectContaining({
          action: "APPROVE",
          reviewer: expect.objectContaining({ displayName: "Mom" }),
        }),
      ]);
    });

    it("AUTO_APPROVE chores skip review, recorded as automatic", async () => {
      const { mom, familyId, billy, billySession } = await setup();
      const today = await choreFor(mom, familyId, billy, { reviewPolicy: "AUTO_APPROVE" });
      const body = (await submit(billySession, familyId, today.id)).json<SubmitResponse>();
      expect(body.instance.status).toBe("APPROVED");
      expect(body.submission.reviews).toEqual([
        expect.objectContaining({ action: "APPROVE", reviewer: null }),
      ]);
    });
  });

  describe("agenda", () => {
    it("carries over unfinished chores from earlier days, but not finished ones", async () => {
      const { mom, familyId, billy, billySession } = await setup();
      await choreFor(mom, familyId, billy, { reviewPolicy: "AUTO_APPROVE" });
      const week = await list(mom, familyId);
      // Finish Tuesday's; leave Wednesday's undone.
      await submit(billySession, familyId, week[0]?.id as string);

      t.advance(minutes(2 * 24 * 60)); // Thursday
      const kid = await t.refresh(billySession);
      const agenda = await t.agenda(kid, familyId);
      expect(agenda.date).toBe("2026-11-12");
      expect(agenda.items.map((i) => i.occurrenceDate).sort()).toEqual([
        "2026-11-11",
        "2026-11-12",
      ]);
    });

    it("filters by member", async () => {
      const { mom, familyId, billy, sally } = await setup();
      await t.createChore(mom, familyId, {
        assignMode: "FIXED",
        eligibleMembershipIds: [billy.id],
      });
      await t.createChore(mom, familyId, {
        name: "Feed fish",
        assignMode: "FIXED",
        eligibleMembershipIds: [sally.id],
      });
      const billys = await t.agenda(mom, familyId, `?memberId=${billy.id}`);
      expect(billys.items.map((i) => i.choreName)).toEqual(["Dishes"]);
      expect((await t.agenda(mom, familyId)).items).toHaveLength(2);
    });

    it("tells each viewer what they can do", async () => {
      const { mom, familyId, billy, billySession, sallySession } = await setup();
      const today = await choreFor(mom, familyId, billy);
      const forBilly = (await t.agenda(billySession, familyId)).items[0];
      const forSally = (await t.agenda(sallySession, familyId)).items[0];
      expect(forBilly?.id).toBe(today.id);
      expect(forBilly?.availableActions).toEqual(["start", "defer", "complete"]);
      expect(forSally?.availableActions).toEqual([]); // she can see it, but it's Billy's
    });
  });

  describe("listing", () => {
    it("paginates with a cursor", async () => {
      const { mom, familyId } = await setup();
      await t.createChore(mom, familyId);
      const first = await t.request(
        "GET",
        `/v1/families/${familyId}/instances?from=2026-11-01&to=2026-11-30&limit=4`,
        { session: mom },
      );
      const page1 = first.json<InstanceList>();
      expect(page1.items).toHaveLength(4);
      const second = await t.request(
        "GET",
        `/v1/families/${familyId}/instances?from=2026-11-01&to=2026-11-30&limit=4&cursor=${page1.nextCursor}`,
        { session: mom },
      );
      const page2 = second.json<InstanceList>();
      expect(page2.items).toHaveLength(3);
      expect(page2.nextCursor).toBeNull();
      expect([...page1.items, ...page2.items].map((i) => i.occurrenceDate)).toEqual([
        "2026-11-10",
        "2026-11-11",
        "2026-11-12",
        "2026-11-13",
        "2026-11-14",
        "2026-11-15",
        "2026-11-16",
      ]);
    });

    it("rejects a tampered cursor and oversized ranges", async () => {
      const { mom, familyId } = await setup();
      const bad = await t.request(
        "GET",
        `/v1/families/${familyId}/instances?from=2026-11-01&to=2026-11-30&cursor=garbage`,
        { session: mom },
      );
      expect(bad.json().error.code).toBe("INVALID_CURSOR");
      const big = await t.request(
        "GET",
        `/v1/families/${familyId}/instances?from=2026-01-01&to=2026-12-31`,
        { session: mom },
      );
      expect(big.json().error.code).toBe("RANGE_TOO_LARGE");
    });
  });
});
