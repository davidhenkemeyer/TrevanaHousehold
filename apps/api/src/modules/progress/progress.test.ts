import type { FamilyGoal, Instance, Member, Progress, SubmitResponse } from "@tenara/contracts";
import { describe, expect, it } from "vitest";
import { type Session, days, minutes, useTestApp } from "../../test/harness.js";

describe("progress: XP, levels, streaks, badges, and the family goal", () => {
  const t = useTestApp();

  async function setup() {
    const mom = await t.signup({ displayName: "Mom" });
    const family = await t.createFamily(mom);
    const familyId = family.family.id;
    const momMember = family.members[0] as Member;
    const billy = await t.addChild(mom, familyId, { displayName: "Billy" });
    const sally = await t.addChild(mom, familyId, { displayName: "Sally" });
    const billySession = await t.switchTo(mom, familyId, billy.id);
    const sallySession = await t.switchTo(mom, familyId, sally.id);
    return { mom, momMember, familyId, billy, sally, billySession, sallySession };
  }

  const f = (familyId: string, path: string) => `/v1/families/${familyId}${path}`;
  async function progress(session: Session, familyId: string) {
    const res = await t.request("GET", f(familyId, "/progress"), { session });
    expect(res.statusCode).toBe(200);
    return res.json<Progress>();
  }
  const of = (p: Progress, member: Member) => {
    const row = p.members.find((m) => m.member.membershipId === member.id);
    if (!row) throw new Error("member not in progress");
    return row;
  };
  /** A daily chore for `owners`; returns today's occurrence. */
  async function choreFor(
    parent: Session,
    familyId: string,
    owners: Member[],
    extra: Record<string, unknown> = {},
  ): Promise<Instance> {
    const chore = await t.createChore(parent, familyId, {
      assignMode: "FIXED",
      eligibleMembershipIds: owners.map((o) => o.id),
      effortMinutes: 15,
      ...extra,
    });
    const today = (await t.agenda(parent, familyId)).items.find((i) => i.choreId === chore.id);
    if (!today) throw new Error("expected an occurrence today");
    return today;
  }
  const submit = async (session: Session, familyId: string, instanceId: string) => {
    const res = await t.request("POST", f(familyId, `/instances/${instanceId}/submissions`), {
      session,
      body: {},
    });
    expect(res.statusCode).toBe(201);
    return res.json<SubmitResponse>();
  };
  const review = (parent: Session, familyId: string, submissionId: string, action: string) =>
    t.request("POST", f(familyId, `/submissions/${submissionId}/review`), {
      session: parent,
      body: { action },
    });

  describe("XP", () => {
    it("awards XP on approval, once, and shows it on the chore beforehand", async () => {
      const { mom, familyId, billy, billySession } = await setup();
      const today = await choreFor(mom, familyId, [billy]);
      expect(today.xp).toBe(15);
      const { submission } = await submit(billySession, familyId, today.id);
      expect(of(await progress(billySession, familyId), billy).xp).toBe(0); // waiting for review

      await review(mom, familyId, submission.id, "APPROVE");
      await review(mom, familyId, submission.id, "APPROVE"); // refused: nothing more
      expect(of(await progress(billySession, familyId), billy)).toMatchObject({
        xp: 15,
        level: 1,
        xpIntoLevel: 15,
        xpForNextLevel: 50,
      });
    });

    it("gives each person on a shared chore the full XP, and uses a chore's custom XP", async () => {
      const { mom, familyId, billy, sally } = await setup();
      const today = await choreFor(mom, familyId, [billy, sally], { xpOverride: 60 });
      expect(today.xp).toBe(60);
      await submit(mom, familyId, today.id); // a parent's "done" approves at once
      const p = await progress(mom, familyId);
      expect(of(p, billy)).toMatchObject({ xp: 60, level: 2 });
      expect(of(p, sally)).toMatchObject({ xp: 60, level: 2 });
    });

    it("gives nothing for rejected work", async () => {
      const { mom, familyId, billy, billySession } = await setup();
      const today = await choreFor(mom, familyId, [billy]);
      const { submission } = await submit(billySession, familyId, today.id);
      await review(mom, familyId, submission.id, "REJECT");
      expect(of(await progress(mom, familyId), billy).xp).toBe(0);
    });

    it("earns XP for parents too, with any reward currency (or none)", async () => {
      const { mom, momMember, familyId } = await setup();
      const today = await choreFor(mom, familyId, [momMember]);
      await submit(mom, familyId, today.id);
      expect(of(await progress(mom, familyId), momMember).xp).toBe(15);
    });
  });

  describe("badges", () => {
    it("awards the first-chore badge once, and never takes it away", async () => {
      const { mom, familyId, billy, billySession } = await setup();
      const today = await choreFor(mom, familyId, [billy]);
      await submit(mom, familyId, today.id);
      const badges = of(await progress(billySession, familyId), billy).badges;
      expect(badges.map((b) => b.key)).toEqual(["FIRST_CHORE"]);
      expect(badges[0]).toMatchObject({ label: "First chore", icon: "star" });

      // A second approval doesn't award it again.
      const tomorrow = (await t.agenda(mom, familyId, "?date=2026-11-11")).items.find(
        (i) => i.occurrenceDate === "2026-11-11",
      );
      await submit(mom, familyId, tomorrow!.id);
      expect(of(await progress(mom, familyId), billy).badges).toHaveLength(1);
      expect(await t.db.memberBadge.count()).toBe(1);
    });

    it("awards Helper for a job taken from the job board", async () => {
      const { mom, familyId, billy, billySession } = await setup();
      await t.createChore(mom, familyId, { name: "Wash the car", assignMode: "OPEN" });
      const board = await t.request("GET", f(familyId, "/job-board"), { session: billySession });
      const job = board.json().items[0];
      await t.request("POST", f(familyId, `/instances/${job.id}/actions`), {
        session: billySession,
        body: { action: "claim" },
      });
      const { submission } = await submit(billySession, familyId, job.id);
      await review(mom, familyId, submission.id, "APPROVE");
      expect(of(await progress(mom, familyId), billy).badges.map((b) => b.key)).toContain("HELPER");
    });

    it("lists every badge for the grid, including chore mastery", async () => {
      const { familyId, billySession } = await setup();
      const p = await progress(billySession, familyId);
      expect(p.allBadges.map((b) => b.key)).toEqual(
        expect.arrayContaining(["FIRST_CHORE", "STREAK_7", "HELPER", "MASTERY:"]),
      );
    });
  });

  describe("streaks", () => {
    it("counts days with everything handed in on time; a day with something missed ends it", async () => {
      const { mom, familyId, billy, billySession } = await setup();
      // Today, Tuesday: handed in on time.
      const today = await choreFor(mom, familyId, [billy], { deadlineMinutes: 12 * 60 });
      await submit(billySession, familyId, today.id);
      expect(of(await progress(billySession, familyId), billy).streak).toEqual({
        days: 1,
        saves: 0,
        best: 1,
      });

      // Wednesday is still open: today doesn't break the streak.
      t.advance(days(1));
      const kid = await t.refresh(billySession);
      expect(of(await progress(kid, familyId), billy).streak.days).toBe(1);

      // Thursday: Wednesday's deadline passed without a hand-in, and there's no save.
      t.advance(days(1));
      const kid2 = await t.refresh(kid);
      expect(of(await progress(kid2, familyId), billy).streak).toEqual({
        days: 0,
        saves: 0,
        best: 1,
      });
    });

    it("counts work sent back for another try, if the first hand-in was on time", async () => {
      const { mom, familyId, billy, billySession } = await setup();
      const today = await choreFor(mom, familyId, [billy]);
      const { submission } = await submit(billySession, familyId, today.id);
      await review(mom, familyId, submission.id, "REQUEST_REWORK");
      t.advance(days(1) + minutes(1));
      const kid = await t.refresh(billySession);
      expect(of(await progress(kid, familyId), billy).streak.best).toBe(1);
    });
  });

  describe("who sees what", () => {
    it("shows parents everyone and kids only themselves", async () => {
      const { mom, familyId, billy, billySession } = await setup();
      expect((await progress(mom, familyId)).members).toHaveLength(3);
      expect(
        (await progress(billySession, familyId)).members.map((m) => m.member.membershipId),
      ).toEqual([billy.id]);
    });

    it("keeps progress while gamification is hidden", async () => {
      const { mom, familyId, billy } = await setup();
      await t.request("PATCH", f(familyId, ""), { session: mom, body: { gamification: false } });
      const today = await choreFor(mom, familyId, [billy]);
      await submit(mom, familyId, today.id);
      const hidden = await progress(mom, familyId);
      expect(hidden.gamification).toBe(false);
      await t.request("PATCH", f(familyId, ""), { session: mom, body: { gamification: true } });
      expect(of(await progress(mom, familyId), billy).xp).toBe(15);
    });
  });

  describe("family goal", () => {
    const startGoal = (session: Session, familyId: string, targetXp: number) =>
      t.request("POST", f(familyId, "/goal"), {
        session,
        body: { name: "Pizza & Movie Night", targetXp },
      });

    it("fills with everyone's XP from when it started, and is marked reached", async () => {
      const { mom, momMember, familyId, billy, billySession } = await setup();
      // XP earned before the goal doesn't count.
      const before = await choreFor(mom, familyId, [billy], { name: "Before" });
      await submit(mom, familyId, before.id);

      t.advance(minutes(1));
      const created = await startGoal(mom, familyId, 25);
      expect(created.statusCode).toBe(201);
      expect(created.json<FamilyGoal>()).toMatchObject({
        progressXp: 0,
        percent: 0,
        reachedAt: null,
      });

      t.advance(minutes(1));
      const kidChore = await choreFor(mom, familyId, [billy], {
        name: "Kid chore",
        effortMinutes: 10,
      });
      await submit(mom, familyId, kidChore.id);
      const halfway = (await progress(billySession, familyId)).goal;
      expect(halfway).toMatchObject({ name: "Pizza & Movie Night", progressXp: 10, percent: 40 });

      const parentChore = await choreFor(mom, familyId, [momMember], { name: "Mom chore" });
      await submit(mom, familyId, parentChore.id);
      const reached = (await progress(billySession, familyId)).goal;
      expect(reached).toMatchObject({ progressXp: 25, percent: 100 });
      expect(reached?.reachedAt).not.toBeNull();
    });

    it("lets only parents start or end a goal, and keeps one open at a time", async () => {
      const { mom, familyId, billySession } = await setup();
      expect((await startGoal(billySession, familyId, 100)).statusCode).toBe(403);
      await startGoal(mom, familyId, 100);
      await startGoal(mom, familyId, 200);
      expect((await progress(mom, familyId)).goal?.targetXp).toBe(200);
      expect(await t.db.familyGoal.count({ where: { closedAt: null } })).toBe(1);
      expect((await t.request("DELETE", f(familyId, "/goal"), { session: mom })).statusCode).toBe(
        204,
      );
      expect((await progress(mom, familyId)).goal).toBeNull();
    });
  });
});
