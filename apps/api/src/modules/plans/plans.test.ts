import type {
  Instance,
  LedgerPage,
  Member,
  Plan,
  RewardsSummary,
  SubmitResponse,
} from "@tenara/contracts";
import { describe, expect, it } from "vitest";
import { planAllFamilies } from "../../jobs/planning.js";
import { T0, WEBHOOK_AUTH, type Session, days, useTestApp } from "../../test/harness.js";

describe("plans", () => {
  const t = useTestApp();
  const f = (familyId: string, path = "") => `/v1/families/${familyId}${path}`;

  async function family(plan: "PRO" | "TRIAL" | "BASIC") {
    const mom = await t.signup({ displayName: "Mom" });
    const created = await t.createFamily(mom, "The Testers", { plan });
    return { mom, familyId: created.family.id, created };
  }

  async function planOf(session: Session, familyId: string): Promise<Plan> {
    const res = await t.request("GET", f(familyId), { session });
    expect(res.statusCode).toBe(200);
    return res.json<{ family: { plan: Plan } }>().family.plan;
  }

  function expectPro(res: { statusCode: number; json: () => unknown }, feature: string) {
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: "PRO_REQUIRED", details: { feature } } });
  }

  describe("the trial", () => {
    it("gives every new family 14 days of Pro, then Basic", async () => {
      const { mom, familyId, created } = await family("TRIAL");
      expect(created.family.plan).toMatchObject({
        tier: "PRO",
        reason: "TRIAL",
        endsAt: new Date(T0.getTime() + days(14)).toISOString(),
        trialUsed: false,
        features: { photos: true, money: true, widgets: true },
        limits: { maxKids: null },
      });

      t.advance(days(14));
      const later = await t.refresh(mom);
      expect(await planOf(later, familyId)).toMatchObject({
        tier: "BASIC",
        reason: null,
        endsAt: null,
        trialUsed: true,
        features: { photos: false, money: false },
        limits: { maxParents: 2, maxKids: 3, historyDays: 30 },
      });
    });

    it("reminds the parents once, 3 days before the trial ends, unless they subscribed", async () => {
      const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };
      const { familyId } = await family("TRIAL");
      const { familyId: paidId } = await family("TRIAL");
      t.billing.entitlements.set(paidId, {
        expiresAt: new Date(T0.getTime() + days(40)),
        productId: "tenara_pro_yearly",
        store: "WEB",
        willRenew: true,
      });
      await t.db.subscription.create({
        data: { familyId: paidId, expiresAt: new Date(T0.getTime() + days(40)), checkedAt: T0 },
      });
      const reminders = () =>
        t.db.notification.findMany({
          where: { type: "TRIAL_ENDING" },
          select: { familyId: true, title: true },
        });

      await planAllFamilies({ db: t.db, now: () => new Date(T0.getTime() + days(10)) }, quiet);
      expect(await reminders()).toEqual([]);
      const at = () => new Date(T0.getTime() + days(11) + 60_000);
      await planAllFamilies({ db: t.db, now: at }, quiet);
      await planAllFamilies({ db: t.db, now: at }, quiet);
      expect(await reminders()).toEqual([{ familyId, title: "Your Pro trial ends in 3 days" }]);
    });
  });

  describe("Basic limits", () => {
    it("fits 3 kids; a 4th needs Pro", async () => {
      const { mom, familyId } = await family("BASIC");
      for (const name of ["A", "B", "C"]) await t.addChild(mom, familyId, { displayName: name });
      const fourth = await t.request("POST", f(familyId, "/children"), {
        session: mom,
        body: { displayName: "D" },
      });
      expectPro(fourth, "extraMembers");
      expect(fourth.json()).toMatchObject({
        error: { message: expect.stringContaining("up to 2 parents and 3 kids") },
      });
    });

    it("fits a second parent; a third needs Pro, when inviting and when accepting", async () => {
      const { mom, familyId } = await family("BASIC");
      const invite = (email: string) =>
        t.request("POST", f(familyId, "/invites"), {
          session: mom,
          body: { email, role: "PARENT" },
        });
      const dadInvite = await invite("dad@example.com");
      expect(dadInvite.statusCode).toBe(201);
      const grandmaInvite = await invite("grandma@example.com");
      expect(grandmaInvite.statusCode).toBe(201);

      // Dad joins: two parents now.
      const dad = await t.signup({ email: "dad@example.com" });
      const dadToken = dadInvite.json<{ token: string }>().token;
      const joined = await t.request("POST", "/v1/invites/accept", {
        session: dad,
        body: { token: dadToken },
      });
      expect(joined.statusCode).toBe(200);

      // Grandma's invite was sent while there was room; accepting it now doesn't fit.
      const grandma = await t.signup({ email: "grandma@example.com" });
      const grandmaToken = grandmaInvite.json<{ token: string }>().token;
      const late = await t.request("POST", "/v1/invites/accept", {
        session: grandma,
        body: { token: grandmaToken },
      });
      expectPro(late, "extraMembers");
      expectPro(await invite("uncle@example.com"), "extraMembers");
    });

    it("keeps photos, the job board, money, the catalog, and the goal for Pro", async () => {
      const { mom, familyId } = await family("BASIC");
      const chore = (body: Record<string, unknown>) =>
        t.request("POST", f(familyId, "/chores"), {
          session: mom,
          body: {
            name: "Dishes",
            effortMinutes: 10,
            recurrence: { freq: "DAILY", startDate: "2026-11-10" },
            deadlineMinutes: 720,
            assignMode: "AUTO",
            ...body,
          },
        });
      expectPro(await chore({ requiresPhoto: true }), "photos");
      expectPro(await chore({ assignMode: "OPEN" }), "jobBoard");
      expect((await chore({})).statusCode).toBe(201);
      expectPro(
        await t.request("PATCH", f(familyId), { session: mom, body: { rewardCurrency: "MONEY" } }),
        "money",
      );
      // Points are free.
      const points = await t.request("PATCH", f(familyId), {
        session: mom,
        body: { rewardCurrency: "POINTS" },
      });
      expect(points.statusCode).toBe(200);
      expectPro(
        await t.request("POST", f(familyId, "/reward-items"), {
          session: mom,
          body: { name: "Screen time", cost: 50 },
        }),
        "catalog",
      );
      expectPro(
        await t.request("POST", f(familyId, "/goal"), {
          session: mom,
          body: { name: "Pizza night", targetXp: 500 },
        }),
        "familyGoal",
      );
    });

    it("lets a parent turn a Pro setting off, but not on", async () => {
      const { mom, familyId } = await family("TRIAL");
      const chore = await t.createChore(mom, familyId, { requiresPhoto: true });
      t.advance(days(15));
      const later = await t.refresh(mom);
      const on = await t.request("PATCH", f(familyId, `/chores/${chore.id}`), {
        session: later,
        body: { requiresPhoto: true },
      });
      expectPro(on, "photos");
      const off = await t.request("PATCH", f(familyId, `/chores/${chore.id}`), {
        session: later,
        body: { requiresPhoto: false },
      });
      expect(off.statusCode).toBe(200);
    });
  });

  describe("after Pro ends", () => {
    /** A trial family with money, a photo chore for Billy, then the trial runs out. */
    async function lapsed() {
      const { mom, familyId } = await family("TRIAL");
      const billy = await t.addChild(mom, familyId, { displayName: "Billy" });
      const money = await t.request("PATCH", f(familyId), {
        session: mom,
        body: { rewardCurrency: "MONEY" },
      });
      expect(money.statusCode).toBe(200);
      await t.createChore(mom, familyId, {
        name: "Make the bed",
        assignMode: "FIXED",
        eligibleMembershipIds: [billy.id],
        requiresPhoto: true,
        rewardAmount: 100,
      });
      t.advance(days(15));
      const parent = await t.refresh(mom);
      // Plan the new day (the planning job does this every night).
      await t.request("POST", f(familyId, "/schedule/replan"), { session: parent });
      const kid = await t.switchTo(parent, familyId, billy.id);
      return { mom: parent, familyId, billy, kid };
    }

    const todayFor = async (session: Session, familyId: string) => {
      const item = (await t.agenda(session, familyId)).items.find(
        (i) => i.choreName === "Make the bed",
      );
      if (!item) throw new Error("no chore today");
      return item;
    };

    it("stops asking for photos and keeps the setting", async () => {
      const { mom, familyId, kid } = await lapsed();
      const today: Instance = await todayFor(kid, familyId);
      expect(today.requiresPhoto).toBe(false);
      const done = await t.request("POST", f(familyId, `/instances/${today.id}/submissions`), {
        session: kid,
        body: {},
      });
      expect(done.statusCode).toBe(201);
      const chores = await t.request("GET", f(familyId, "/chores"), { session: mom });
      expect(chores.json<{ chores: { requiresPhoto: boolean }[] }>().chores[0]?.requiresPhoto).toBe(
        true,
      );
    });

    it("stops paying money but still gives XP, and payouts still work", async () => {
      const { mom, familyId, billy, kid } = await lapsed();
      const today = await todayFor(kid, familyId);
      const submitted = await t.request("POST", f(familyId, `/instances/${today.id}/submissions`), {
        session: kid,
        body: {},
      });
      const submissionId = submitted.json<SubmitResponse>().submission.id;
      const approved = await t.request("POST", f(familyId, `/submissions/${submissionId}/review`), {
        session: mom,
        body: { action: "APPROVE" },
      });
      expect(approved.statusCode).toBe(200);

      const summary = await t.request("GET", f(familyId, "/rewards"), { session: mom });
      const row = summary
        .json<RewardsSummary>()
        .members.find((m) => m.member.membershipId === billy.id);
      expect(row?.balance).toBe(0);
      expect(row?.pending).toBe(0);
      const progress = await t.request("GET", f(familyId, "/progress"), { session: kid });
      expect(JSON.stringify(progress.json())).toMatch(/"xp":\s*1\d/);

      // Settling an old balance is always possible.
      const payout = await t.request("POST", f(familyId, "/rewards/payouts"), {
        session: mom,
        body: { memberId: billy.id, amount: 100, currencyCode: "USD" },
      });
      expect(payout.statusCode).toBe(201);
    });

    it("hides history older than 30 days, but balances count everything", async () => {
      const { mom, familyId } = await family("TRIAL");
      const billy: Member = await t.addChild(mom, familyId, { displayName: "Billy" });
      await t.request("PATCH", f(familyId), { session: mom, body: { rewardCurrency: "POINTS" } });
      const fix = await t.request("POST", f(familyId, "/rewards/corrections"), {
        session: mom,
        body: { memberId: billy.id, currency: "POINTS", amount: 40, note: "Starting points" },
      });
      expect(fix.statusCode).toBe(201);
      t.advance(days(31));
      const later = await t.refresh(mom);
      const ledger = await t.request("GET", f(familyId, `/rewards/ledger?memberId=${billy.id}`), {
        session: later,
      });
      expect(ledger.json<LedgerPage>().items).toEqual([]);
      const summary = await t.request("GET", f(familyId, "/rewards"), { session: later });
      const row = summary
        .json<RewardsSummary>()
        .members.find((m) => m.member.membershipId === billy.id);
      expect(row?.balance).toBe(40);
    });
  });

  describe("subscriptions", () => {
    const pro = {
      expiresAt: new Date(T0.getTime() + days(30)),
      productId: "tenara_pro_monthly",
      store: "APP_STORE" as const,
      willRenew: true,
    };

    it("confirms a purchase with RevenueCat when the app asks", async () => {
      const { mom, familyId } = await family("BASIC");
      t.billing.entitlements.set(familyId, pro);
      const res = await t.request("POST", f(familyId, "/billing/refresh"), { session: mom });
      expect(res.statusCode).toBe(200);
      expect(res.json<Plan>()).toMatchObject({
        tier: "PRO",
        reason: "SUBSCRIPTION",
        endsAt: pro.expiresAt.toISOString(),
        willRenew: true,
        store: "APP_STORE",
      });
      expect(t.billing.lookups).toEqual([familyId]);
      // A 4th kid fits now.
      for (const name of ["A", "B", "C", "D"]) {
        await t.addChild(mom, familyId, { displayName: name });
      }
    });

    it("is for parents only", async () => {
      const { mom, familyId } = await family("BASIC");
      const billy = await t.addChild(mom, familyId, { displayName: "Billy" });
      const kid = await t.switchTo(mom, familyId, billy.id);
      const res = await t.request("POST", f(familyId, "/billing/refresh"), { session: kid });
      expect(res.statusCode).toBe(403);
    });

    it("follows RevenueCat's webhook, checking its Authorization and asking RevenueCat", async () => {
      const { mom, familyId } = await family("BASIC");
      const hook = (authorization: string | undefined, appUserId: string) =>
        t.app.inject({
          method: "POST",
          url: "/v1/billing/revenuecat",
          headers: authorization ? { authorization } : {},
          payload: { api_version: "1.0", event: { type: "RENEWAL", app_user_id: appUserId } },
        });

      expect((await hook(undefined, familyId)).statusCode).toBe(401);
      expect((await hook("Bearer wrong", familyId)).statusCode).toBe(401);
      expect(t.billing.lookups).toEqual([]);

      t.billing.entitlements.set(familyId, pro);
      const ok = await hook(WEBHOOK_AUTH, familyId);
      expect(ok.statusCode).toBe(200);
      expect(ok.json()).toEqual({ synced: 1 });
      expect((await planOf(mom, familyId)).tier).toBe("PRO");

      // Expiry: RevenueCat now reports a past end date.
      t.billing.entitlements.set(familyId, { ...pro, expiresAt: new Date(T0.getTime() - 1) });
      await hook(WEBHOOK_AUTH, familyId);
      expect((await planOf(mom, familyId)).tier).toBe("BASIC");

      // Anonymous RevenueCat ids and unknown families are ignored.
      const other = await hook(WEBHOOK_AUTH, "$RCAnonymousID:abc");
      expect(other.json()).toEqual({ synced: 0 });
    });
  });
});
