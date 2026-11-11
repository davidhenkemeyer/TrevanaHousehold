import type {
  Instance,
  JobBoard,
  LedgerChangeResponse,
  LedgerPage,
  Member,
  Redemption,
  RewardItem,
  RewardsSummary,
  SubmitResponse,
  WeekLoad,
} from "@titan/contracts";
import { describe, expect, it } from "vitest";
import { expireOpenJobs, markLateInstances } from "../../jobs/lateness.js";
import { type Session, useTestApp } from "../../test/harness.js";
import { onApproved } from "./hooks.js";

describe("rewards", () => {
  const t = useTestApp();
  const quiet = { info: () => undefined };

  /** Mom, Billy, and Sally, with the family's rewards set to `currency`. */
  async function setup(currency: "NONE" | "MONEY" | "POINTS" = "POINTS") {
    const mom = await t.signup({ displayName: "Mom" });
    const family = await t.createFamily(mom);
    const familyId = family.family.id;
    const billy = await t.addChild(mom, familyId, { displayName: "Billy" });
    const sally = await t.addChild(mom, familyId, { displayName: "Sally" });
    const billySession = await t.switchTo(mom, familyId, billy.id);
    const sallySession = await t.switchTo(mom, familyId, sally.id);
    if (currency !== "NONE") await setCurrency(mom, familyId, currency);
    return { mom, familyId, billy, sally, billySession, sallySession };
  }

  async function setCurrency(parent: Session, familyId: string, rewardCurrency: string) {
    const res = await t.request("PATCH", `/v1/families/${familyId}`, {
      session: parent,
      body: { rewardCurrency },
    });
    expect(res.statusCode).toBe(200);
  }

  const f = (familyId: string, path: string) => `/v1/families/${familyId}${path}`;

  async function summary(session: Session, familyId: string) {
    const res = await t.request("GET", f(familyId, "/rewards"), { session });
    expect(res.statusCode).toBe(200);
    return res.json<RewardsSummary>();
  }
  const rewardsOf = async (session: Session, familyId: string, member: Member) => {
    const row = (await summary(session, familyId)).members.find(
      (m) => m.member.membershipId === member.id,
    );
    if (!row) throw new Error("member not in summary");
    return row;
  };

  /** A daily chore for `owners` worth `rewardAmount`; returns today's occurrence. */
  async function choreFor(
    parent: Session,
    familyId: string,
    owners: Member[],
    rewardAmount: number,
    extra: Record<string, unknown> = {},
  ) {
    await t.createChore(parent, familyId, {
      assignMode: "FIXED",
      eligibleMembershipIds: owners.map((o) => o.id),
      rewardAmount,
      ...extra,
    });
    const today = (await t.agenda(parent, familyId)).items.at(-1);
    if (!today) throw new Error("expected an occurrence today");
    return today;
  }

  const submit = (session: Session, familyId: string, instanceId: string) =>
    t.request("POST", f(familyId, `/instances/${instanceId}/submissions`), { session, body: {} });
  const review = (parent: Session, familyId: string, submissionId: string, action: string) =>
    t.request("POST", f(familyId, `/submissions/${submissionId}/review`), {
      session: parent,
      body: { action },
    });
  const act = (session: Session, familyId: string, instanceId: string, action: string) =>
    t.request("POST", f(familyId, `/instances/${instanceId}/actions`), {
      session,
      body: { action },
    });
  /** Gives a member a starting balance, the way a parent would fix a mistake. */
  const correct = (parent: Session, familyId: string, member: Member, body: object) =>
    t.request("POST", f(familyId, "/rewards/corrections"), {
      session: parent,
      body: { memberId: member.id, currency: "POINTS", note: "Starting balance", ...body },
    });

  describe("earning", () => {
    it("shows a reward as pending until approval, then pays it once", async () => {
      const { mom, familyId, billy, billySession } = await setup();
      const today = await choreFor(mom, familyId, [billy], 50);
      const submitted = (await submit(billySession, familyId, today.id)).json<SubmitResponse>();

      expect(await rewardsOf(mom, familyId, billy)).toMatchObject({ balance: 0, pending: 50 });
      expect((await review(mom, familyId, submitted.submission.id, "APPROVE")).statusCode).toBe(
        200,
      );
      expect(await rewardsOf(mom, familyId, billy)).toMatchObject({ balance: 50, pending: 0 });

      // A second approval is refused and pays nothing more.
      expect((await review(mom, familyId, submitted.submission.id, "APPROVE")).statusCode).toBe(
        409,
      );
      expect((await rewardsOf(mom, familyId, billy)).balance).toBe(50);

      const ledger = await t.request("GET", f(familyId, "/rewards/ledger"), {
        session: billySession,
      });
      expect(ledger.json<LedgerPage>().items).toMatchObject([
        { type: "EARNED", amount: 50, currency: "POINTS", choreName: "Dishes", createdBy: null },
      ]);
    });

    it("never writes the same reward twice, even if the hook runs again", async () => {
      const { mom, familyId, billy } = await setup();
      const today = await choreFor(mom, familyId, [billy], 50);
      const approved = {
        id: today.id,
        familyId,
        rewardAmount: 50,
        effortMinutes: 10,
        assigneeIds: [billy.id],
      };
      await t.db.$transaction(async (tx) => {
        await onApproved(tx, new Date(), approved);
        await onApproved(tx, new Date(), approved);
      });
      expect(await t.db.ledgerEntry.count()).toBe(1);
    });

    it("splits a shared chore's reward in whole units that add up", async () => {
      const { mom, familyId, billy, sally } = await setup("MONEY");
      const today = await choreFor(mom, familyId, [billy, sally], 5);
      // A parent's "done" approves on the spot.
      expect((await submit(mom, familyId, today.id)).statusCode).toBe(201);
      const balances = (await summary(mom, familyId)).members.map((m) => m.balance).sort();
      expect(balances).toEqual([0, 2, 3]); // Mom 0; the kids share 5 cents
      const entries = await t.db.ledgerEntry.findMany();
      expect(entries.every((e) => e.currency === "MONEY" && e.currencyCode === "USD")).toBe(true);
    });

    it("pays nothing when rewards are off, and nothing for a rejected chore", async () => {
      const off = await setup("NONE");
      const a = await choreFor(off.mom, off.familyId, [off.billy], 50);
      await submit(off.mom, off.familyId, a.id);
      expect(await t.db.ledgerEntry.count()).toBe(0);
      expect(await rewardsOf(off.mom, off.familyId, off.billy)).toMatchObject({
        balance: 0,
        pending: 0,
      });

      const on = await setup();
      const b = await choreFor(on.mom, on.familyId, [on.billy], 50);
      const submitted = (await submit(on.billySession, on.familyId, b.id)).json<SubmitResponse>();
      await review(on.mom, on.familyId, submitted.submission.id, "REJECT");
      expect(await rewardsOf(on.mom, on.familyId, on.billy)).toMatchObject({
        balance: 0,
        pending: 0,
      });
    });

    it("keeps earlier balances when the family changes currency", async () => {
      const { mom, familyId, billy } = await setup();
      const today = await choreFor(mom, familyId, [billy], 50);
      await submit(mom, familyId, today.id);
      await setCurrency(mom, familyId, "MONEY");
      expect(await rewardsOf(mom, familyId, billy)).toMatchObject({
        balance: 0,
        otherBalances: [{ currency: "POINTS", currencyCode: null, balance: 50 }],
      });
      await setCurrency(mom, familyId, "POINTS");
      expect(await rewardsOf(mom, familyId, billy)).toMatchObject({
        balance: 50,
        otherBalances: [],
      });
    });
  });

  describe("who sees what", () => {
    it("shows parents everyone and kids only themselves", async () => {
      const { mom, familyId, billy, sally, billySession } = await setup();
      await correct(mom, familyId, sally, { amount: 30 });
      expect((await summary(mom, familyId)).members).toHaveLength(3);
      const mine = await summary(billySession, familyId);
      expect(mine.members.map((m) => m.member.membershipId)).toEqual([billy.id]);

      const peek = await t.request("GET", f(familyId, `/rewards/ledger?memberId=${sally.id}`), {
        session: billySession,
      });
      expect(peek.statusCode).toBe(403);
      const parentView = await t.request(
        "GET",
        f(familyId, `/rewards/ledger?memberId=${sally.id}`),
        { session: mom },
      );
      expect(parentView.json<LedgerPage>().items).toHaveLength(1);
    });
  });

  describe("payouts and corrections", () => {
    it("records a payout, which may exceed the balance (an advance)", async () => {
      const { mom, familyId, billy, billySession } = await setup("MONEY");
      const today = await choreFor(mom, familyId, [billy], 300);
      await submit(mom, familyId, today.id);

      const res = await t.request("POST", f(familyId, "/rewards/payouts"), {
        session: mom,
        body: { memberId: billy.id, amount: 500, note: "Allowance" },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json<LedgerChangeResponse>()).toMatchObject({
        balance: -200,
        entry: {
          type: "PAYOUT",
          amount: -500,
          note: "Allowance",
          createdBy: { displayName: "Mom" },
        },
      });
      // Later earnings pay the advance back.
      const tomorrow = (await t.agenda(mom, familyId, "?date=2026-11-11")).items.find(
        (i) => i.occurrenceDate === "2026-11-11",
      );
      await submit(mom, familyId, tomorrow!.id);
      expect((await rewardsOf(mom, familyId, billy)).balance).toBe(100);

      const kid = await t.request("POST", f(familyId, "/rewards/payouts"), {
        session: billySession,
        body: { memberId: billy.id, amount: 1 },
      });
      expect(kid.statusCode).toBe(403);
    });

    it("refuses a payout when there's no money in play", async () => {
      const { mom, familyId, billy } = await setup("POINTS");
      const res = await t.request("POST", f(familyId, "/rewards/payouts"), {
        session: mom,
        body: { memberId: billy.id, amount: 100 },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("MONEY_NOT_IN_USE");
    });

    it("lets a parent settle an earlier money balance after switching to points", async () => {
      const { mom, familyId, billy } = await setup("MONEY");
      const today = await choreFor(mom, familyId, [billy], 300);
      await submit(mom, familyId, today.id);
      await setCurrency(mom, familyId, "POINTS");
      const res = await t.request("POST", f(familyId, "/rewards/payouts"), {
        session: mom,
        body: { memberId: billy.id, amount: 300 },
      });
      expect(res.statusCode).toBe(201);
      expect((await rewardsOf(mom, familyId, billy)).otherBalances).toEqual([]);
    });

    it("requires a note on corrections, in either direction", async () => {
      const { mom, familyId, billy, billySession } = await setup();
      const noNote = await t.request("POST", f(familyId, "/rewards/corrections"), {
        session: mom,
        body: { memberId: billy.id, currency: "POINTS", amount: 10 },
      });
      expect(noNote.statusCode).toBe(400);
      expect((await correct(mom, familyId, billy, { amount: 0 })).statusCode).toBe(400);

      expect((await correct(mom, familyId, billy, { amount: 40 })).statusCode).toBe(201);
      const down = await correct(mom, familyId, billy, { amount: -15, note: "Entered twice" });
      expect(down.json<LedgerChangeResponse>()).toMatchObject({
        balance: 25,
        entry: { type: "CORRECTION", amount: -15, note: "Entered twice" },
      });
      expect((await correct(billySession, familyId, billy, { amount: 999 })).statusCode).toBe(403);
    });
  });

  describe("catalog and redemptions", () => {
    async function withItem(cost = 50) {
      const ctx = await setup();
      const res = await t.request("POST", f(ctx.familyId, "/reward-items"), {
        session: ctx.mom,
        body: { name: "30 min screen time", cost },
      });
      expect(res.statusCode).toBe(201);
      return { ...ctx, item: res.json<RewardItem>() };
    }
    const ask = (session: Session, familyId: string, itemId: string) =>
      t.request("POST", f(familyId, "/redemptions"), { session, body: { itemId } });
    const decide = (parent: Session, familyId: string, id: string, action: string) =>
      t.request("POST", f(familyId, `/redemptions/${id}/decision`), {
        session: parent,
        body: { action },
      });

    it("lets parents manage the catalog and everyone read it", async () => {
      const { mom, familyId, billySession, item } = await withItem();
      const kidCreate = await t.request("POST", f(familyId, "/reward-items"), {
        session: billySession,
        body: { name: "Unlimited candy", cost: 1 },
      });
      expect(kidCreate.statusCode).toBe(403);

      const renamed = await t.request("PATCH", f(familyId, `/reward-items/${item.id}`), {
        session: mom,
        body: { cost: 40 },
      });
      expect(renamed.json<RewardItem>()).toMatchObject({ name: "30 min screen time", cost: 40 });
      const list = await t.request("GET", f(familyId, "/reward-items"), { session: billySession });
      expect(list.json().items).toHaveLength(1);

      const removed = await t.request("DELETE", f(familyId, `/reward-items/${item.id}`), {
        session: mom,
      });
      expect(removed.statusCode).toBe(204);
      expect((await ask(billySession, familyId, item.id)).statusCode).toBe(404);
    });

    it("holds the points on request and refuses to overspend", async () => {
      const { mom, familyId, billy, billySession, item } = await withItem(50);
      await correct(mom, familyId, billy, { amount: 60 });

      const first = await ask(billySession, familyId, item.id);
      expect(first.statusCode).toBe(201);
      expect(first.json<Redemption>()).toMatchObject({
        status: "REQUESTED",
        itemName: "30 min screen time",
        cost: 50,
      });
      expect((await rewardsOf(mom, familyId, billy)).balance).toBe(10);

      const second = await ask(billySession, familyId, item.id);
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe("NOT_ENOUGH_POINTS");
    });

    it("can't spend the same points twice with two requests at once", async () => {
      const { mom, familyId, billy, billySession, item } = await withItem(50);
      await correct(mom, familyId, billy, { amount: 60 });
      const results = await Promise.all([
        ask(billySession, familyId, item.id),
        ask(billySession, familyId, item.id),
      ]);
      expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
      expect((await rewardsOf(mom, familyId, billy)).balance).toBe(10);
    });

    it("gives the points back when a request is denied or canceled, and keeps them spent when approved", async () => {
      const { mom, familyId, billy, sallySession, billySession, item } = await withItem(50);
      await correct(mom, familyId, billy, { amount: 60 });

      const denied = (await ask(billySession, familyId, item.id)).json<Redemption>();
      expect((await decide(mom, familyId, denied.id, "DENY")).json<Redemption>()).toMatchObject({
        status: "DENIED",
        decidedBy: { displayName: "Mom" },
      });
      expect((await rewardsOf(mom, familyId, billy)).balance).toBe(60);
      // Answered once only.
      expect((await decide(mom, familyId, denied.id, "APPROVE")).statusCode).toBe(409);

      const canceled = (await ask(billySession, familyId, item.id)).json<Redemption>();
      // A sibling can't cancel it; a kid can't approve their own.
      const sibling = await t.request("POST", f(familyId, `/redemptions/${canceled.id}/cancel`), {
        session: sallySession,
      });
      expect(sibling.statusCode).toBe(404);
      expect((await decide(billySession, familyId, canceled.id, "APPROVE")).statusCode).toBe(403);
      const cancel = await t.request("POST", f(familyId, `/redemptions/${canceled.id}/cancel`), {
        session: billySession,
      });
      expect(cancel.json<Redemption>()).toMatchObject({ status: "CANCELED", decidedBy: null });
      expect((await rewardsOf(mom, familyId, billy)).balance).toBe(60);

      const approved = (await ask(billySession, familyId, item.id)).json<Redemption>();
      expect((await decide(mom, familyId, approved.id, "APPROVE")).statusCode).toBe(200);
      expect((await rewardsOf(mom, familyId, billy)).balance).toBe(10);

      // Parents see everyone's requests; kids only their own.
      const waiting = await t.request("GET", f(familyId, "/redemptions?status=REQUESTED"), {
        session: mom,
      });
      expect(waiting.json().items).toHaveLength(0);
      const all = await t.request("GET", f(familyId, "/redemptions"), { session: mom });
      expect(all.json().items).toHaveLength(3);
      const sallys = await t.request("GET", f(familyId, "/redemptions"), { session: sallySession });
      expect(sallys.json().items).toHaveLength(0);
    });

    it("only works when the family uses points", async () => {
      const { mom, familyId, billySession, item } = await withItem();
      await setCurrency(mom, familyId, "MONEY");
      const res = await ask(billySession, familyId, item.id);
      expect(res.json().error.code).toBe("POINTS_NOT_IN_USE");
    });
  });

  describe("job board", () => {
    /** An extra job on the board worth 500, open to `pool` (empty = everyone). */
    async function withJob(pool: (ctx: Awaited<ReturnType<typeof setup>>) => Member[] = () => []) {
      const ctx = await setup("MONEY");
      const chore = await t.createChore(ctx.mom, ctx.familyId, {
        name: "Wash the car",
        kind: "EXTRA_JOB",
        assignMode: "OPEN",
        effortMinutes: 45,
        rewardAmount: 500,
        eligibleMembershipIds: pool(ctx).map((m) => m.id),
      });
      return { ...ctx, chore };
    }
    const board = async (session: Session, familyId: string) => {
      const res = await t.request("GET", f(familyId, "/job-board"), { session });
      expect(res.statusCode).toBe(200);
      return res.json<JobBoard>().items;
    };

    it("puts open jobs on the board, not on anyone's list or anyone's capacity", async () => {
      const { mom, familyId, billySession } = await withJob();
      const jobs = await board(billySession, familyId);
      expect(jobs).toMatchObject([
        {
          choreName: "Wash the car",
          kind: "EXTRA_JOB",
          board: "OPEN",
          assignees: [],
          rewardAmount: 500,
          availableActions: ["claim"],
        },
      ]);
      expect((await t.agenda(mom, familyId)).items).toEqual([]);
      const load = (
        await t.request("GET", f(familyId, "/week-load"), { session: mom })
      ).json<WeekLoad>();
      expect(load.days.flatMap((d) => d.members).every((m) => m.assignedMinutes === 0)).toBe(true);
    });

    it("gives the job to whoever claims it first", async () => {
      const { mom, familyId, billy, sally, billySession, sallySession } = await withJob();
      const [job] = await board(billySession, familyId);
      const results = await Promise.all([
        act(billySession, familyId, job!.id, "claim"),
        act(sallySession, familyId, job!.id, "claim"),
      ]);
      expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
      const winner = results.find((r) => r.statusCode === 200)!.json<Instance>();
      expect(winner.board).toBe("CLAIMED");
      expect(winner.assignees).toHaveLength(1);
      expect(results.find((r) => r.statusCode === 409)!.json().error.code).toBe("ALREADY_CLAIMED");
      expect(await board(mom, familyId)).toEqual([]);
      // Today's job is gone from the board; the winner has it on their list.
      const winnerId = winner.assignees[0]!.membershipId;
      const mine = await t.agenda(mom, familyId, `?memberId=${winnerId}`);
      expect(mine.items.map((i) => i.id)).toContain(job!.id);
      expect([billy.id, sally.id]).toContain(winnerId);
      // A later claim gets the same answer.
      const late = await act(mom, familyId, job!.id, "claim");
      expect(late.json().error.code).toBe("ALREADY_CLAIMED");
    });

    it("only lets people in the job's pool see and claim it, parents included", async () => {
      const { mom, familyId, billySession, sallySession } = await withJob((c) => [c.sally]);
      expect(await board(billySession, familyId)).toEqual([]);
      expect(await board(mom, familyId)).toEqual([]);
      const [job] = await board(sallySession, familyId);
      expect((await act(billySession, familyId, job!.id, "claim")).statusCode).toBe(403);
      expect((await act(mom, familyId, job!.id, "claim")).statusCode).toBe(403);
      expect((await act(sallySession, familyId, job!.id, "claim")).statusCode).toBe(200);
    });

    it("lets a parent claim when the job is open to everyone", async () => {
      const { mom, familyId } = await withJob();
      const [job] = await board(mom, familyId);
      expect((await act(mom, familyId, job!.id, "claim")).statusCode).toBe(200);
    });

    it("lets the claimer give a job back, and pays whoever finishes it", async () => {
      const { mom, familyId, billy, sally, billySession, sallySession } = await withJob();
      const [job] = await board(billySession, familyId);
      const claimed = (await act(billySession, familyId, job!.id, "claim")).json<Instance>();
      expect(claimed.availableActions).toContain("release");
      // Sally can't give away Billy's job.
      expect((await act(sallySession, familyId, job!.id, "release")).statusCode).toBe(403);
      await act(billySession, familyId, job!.id, "start");
      const released = (await act(billySession, familyId, job!.id, "release")).json<Instance>();
      expect(released).toMatchObject({ board: "OPEN", status: "NEW", assignees: [] });

      await act(sallySession, familyId, job!.id, "claim");
      const submitted = (await submit(sallySession, familyId, job!.id)).json<SubmitResponse>();
      expect((await rewardsOf(mom, familyId, sally)).pending).toBe(500);
      await review(mom, familyId, submitted.submission.id, "APPROVE");
      expect((await rewardsOf(mom, familyId, sally)).balance).toBe(500);
      expect((await rewardsOf(mom, familyId, billy)).balance).toBe(0);
    });

    it("can't be completed while nobody holds it", async () => {
      const { mom, familyId } = await withJob();
      const [job] = await board(mom, familyId);
      const res = await submit(mom, familyId, job!.id);
      expect(res.statusCode).toBe(409);
      expect(await t.db.ledgerEntry.count()).toBe(0);
    });

    it("expires unclaimed jobs at their deadline without marking anyone late", async () => {
      const { familyId, billySession } = await withJob();
      const [job] = await board(billySession, familyId);
      const deps = { db: t.db, now: () => new Date(Date.parse(job!.dueAt) + 60_000) };
      expect(await markLateInstances(deps, quiet)).toBe(0);
      expect(await expireOpenJobs(deps, quiet)).toBe(1);
      expect(await expireOpenJobs(deps, quiet)).toBe(0); // once only
      const row = await t.db.choreInstance.findUniqueOrThrow({
        where: { id: job!.id },
        include: { events: true },
      });
      expect(row).toMatchObject({ status: "CANCELED", isLate: false });
      expect(row.events.map((e) => e.action)).toEqual(["expire"]);
    });

    it("marks a claimed job late like any other chore", async () => {
      const { familyId, billySession } = await withJob();
      const [job] = await board(billySession, familyId);
      await act(billySession, familyId, job!.id, "claim");
      const deps = { db: t.db, now: () => new Date(Date.parse(job!.dueAt) + 60_000) };
      expect(await expireOpenJobs(deps, quiet)).toBe(0);
      expect(await markLateInstances(deps, quiet)).toBe(1);
    });
  });
});
