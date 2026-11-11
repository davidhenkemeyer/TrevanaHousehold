import type {
  Inbox,
  Instance,
  Member,
  NotificationSettings,
  RewardItem,
  SubmitResponse,
} from "@titan/contracts";
import { describe, expect, it } from "vitest";
import { markLateInstances } from "../../jobs/lateness.js";
import {
  checkPushReceipts,
  sendDigests,
  sendInstantNotifications,
} from "../../jobs/notifications.js";
import { type Session, days, minutes, useTestApp } from "../../test/harness.js";

/** T0 is Tuesday 2026-11-10, 06:00 in Chicago: inside the default quiet hours (21:00–07:00). */
describe("notifications", () => {
  const t = useTestApp();
  const quiet = { info: () => undefined };
  const jobDeps = () => ({ db: t.db, push: t.push, now: () => currentTime });
  let currentTime = new Date();
  /** Moves the app clock and keeps the job clock in step. */
  const advance = (ms: number) => {
    t.advance(ms);
    currentTime = new Date(currentTime.getTime() + ms);
  };

  async function setup() {
    currentTime = new Date("2026-11-10T12:00:00.000Z");
    const mom = await t.signup({ displayName: "Mom" });
    const dad = await t.signup({ displayName: "Dad", email: "dad@example.com" });
    const family = await t.createFamily(mom);
    const familyId = family.family.id;
    const momMember = family.members[0] as Member;
    // Dad joins as a second parent.
    const invite = await t.request("POST", `/v1/families/${familyId}/invites`, {
      session: mom,
      body: { email: "dad@example.com", role: "PARENT" },
    });
    await t.request("POST", "/v1/invites/accept", {
      session: dad,
      body: { token: invite.json().token },
    });
    const billy = await t.addChild(mom, familyId, { displayName: "Billy" });
    const sally = await t.addChild(mom, familyId, { displayName: "Sally" });
    const billySession = await t.switchTo(mom, familyId, billy.id);
    const sallySession = await t.switchTo(mom, familyId, sally.id);
    return { mom, dad, momMember, familyId, billy, sally, billySession, sallySession };
  }

  const f = (familyId: string, path: string) => `/v1/families/${familyId}${path}`;
  async function inbox(session: Session, familyId: string) {
    const res = await t.request("GET", f(familyId, "/notifications"), { session });
    expect(res.statusCode).toBe(200);
    return res.json<Inbox>();
  }
  const titles = async (session: Session, familyId: string) =>
    (await inbox(session, familyId)).items.map((n) => n.title);

  async function choreFor(parent: Session, familyId: string, owner: Member): Promise<Instance> {
    const chore = await t.createChore(parent, familyId, {
      name: "Dishes",
      assignMode: "FIXED",
      eligibleMembershipIds: [owner.id],
    });
    const today = (await t.agenda(parent, familyId)).items.find((i) => i.choreId === chore.id);
    if (!today) throw new Error("expected an occurrence today");
    return today;
  }
  const submit = async (session: Session, familyId: string, instanceId: string) =>
    (
      await t.request("POST", f(familyId, `/instances/${instanceId}/submissions`), {
        session,
        body: {},
      })
    ).json<SubmitResponse>();
  const review = (parent: Session, familyId: string, submissionId: string, body: object) =>
    t.request("POST", f(familyId, `/submissions/${submissionId}/review`), {
      session: parent,
      body,
    });
  const registerPhone = (session: Session, token: string) =>
    t.request("POST", "/v1/me/devices", {
      session,
      body: { expoPushToken: token, platform: "ios" },
    });

  describe("what happens creates the right notifications", () => {
    it("tells parents a chore was handed in, and the kid how it went", async () => {
      const { mom, dad, familyId, billy, billySession } = await setup();
      const today = await choreFor(mom, familyId, billy);
      expect(await titles(billySession, familyId)).toEqual(["New chore: Dishes"]);

      const { submission } = await submit(billySession, familyId, today.id);
      for (const parent of [mom, dad]) {
        expect(await titles(parent, familyId)).toEqual(["Billy handed in Dishes"]);
      }

      await review(mom, familyId, submission.id, {
        action: "REQUEST_REWORK",
        note: "The pans too",
      });
      const kid = await inbox(billySession, familyId);
      expect(kid.items[0]).toMatchObject({
        type: "NEEDS_REWORK",
        title: "Try again: Dishes",
        body: "Mom says: The pans too",
        instanceId: today.id,
        read: false,
      });
      // Mom did it, so Mom isn't told.
      expect(await titles(mom, familyId)).toEqual(["Billy handed in Dishes"]);

      const again = await submit(billySession, familyId, today.id);
      await review(mom, familyId, again.submission.id, { action: "APPROVE" });
      expect((await titles(billySession, familyId)).slice(0, 2).sort()).toEqual([
        "Approved: Dishes",
        "New badge: First chore",
      ]);
    });

    it("never notifies the person who did it", async () => {
      const { mom, momMember, familyId } = await setup();
      const today = await choreFor(mom, familyId, momMember);
      await submit(mom, familyId, today.id); // a parent's own chore, approved on the spot
      expect((await titles(mom, familyId)).filter((x) => x.startsWith("Approved"))).toEqual([]);
    });

    it("tells parents about reward requests, and the kid about the answer", async () => {
      const { mom, dad, familyId, billy, billySession } = await setup();
      await t.request("PATCH", f(familyId, ""), {
        session: mom,
        body: { rewardCurrency: "POINTS" },
      });
      await t.request("POST", f(familyId, "/rewards/corrections"), {
        session: mom,
        body: { memberId: billy.id, currency: "POINTS", amount: 100, note: "Start" },
      });
      const item = (
        await t.request("POST", f(familyId, "/reward-items"), {
          session: mom,
          body: { name: "Screen time", cost: 50 },
        })
      ).json<RewardItem>();
      const asked = await t.request("POST", f(familyId, "/redemptions"), {
        session: billySession,
        body: { itemId: item.id },
      });
      const dadInbox = await inbox(dad, familyId);
      expect(dadInbox.items[0]).toMatchObject({
        type: "REDEMPTION_REQUESTED",
        title: "Billy asks for Screen time",
        body: "50 pts. Say yes or not now in Review.",
        redemptionId: asked.json().id,
      });

      await t.request("POST", f(familyId, `/redemptions/${asked.json().id}/decision`), {
        session: dad,
        body: { action: "DENY" },
      });
      expect((await inbox(billySession, familyId)).items[0]).toMatchObject({
        title: "Not now: Screen time",
        body: "Your points are back.",
      });
    });

    it("tells the kid when a chore goes late", async () => {
      const { mom, familyId, billy, billySession } = await setup();
      const today = await choreFor(mom, familyId, billy);
      await markLateInstances(
        { db: t.db, now: () => new Date(Date.parse(today.dueAt) + 60_000) },
        quiet,
      );
      expect(await titles(billySession, familyId)).toContain("Late: Dishes");
    });
  });

  describe("the inbox", () => {
    it("is private, counts unread, and marks read", async () => {
      const { mom, familyId, billy, billySession, sallySession } = await setup();
      await choreFor(mom, familyId, billy);
      expect((await inbox(sallySession, familyId)).items).toEqual([]);
      const mine = await inbox(billySession, familyId);
      expect(mine.unreadCount).toBe(1);

      // Sally can't mark Billy's as read.
      await t.request("POST", f(familyId, "/notifications/read"), {
        session: sallySession,
        body: { ids: [mine.items[0]!.id] },
      });
      expect((await inbox(billySession, familyId)).unreadCount).toBe(1);

      const res = await t.request("POST", f(familyId, "/notifications/read"), {
        session: billySession,
        body: {},
      });
      expect(res.statusCode).toBe(204);
      const after = await inbox(billySession, familyId);
      expect(after.unreadCount).toBe(0);
      expect(after.items[0]?.read).toBe(true);
    });
  });

  describe("settings", () => {
    it("starts with the defaults and saves changes", async () => {
      const { familyId, billySession } = await setup();
      const url = f(familyId, "/notification-settings");
      const defaults = (
        await t.request("GET", url, { session: billySession })
      ).json<NotificationSettings>();
      expect(defaults).toMatchObject({
        digestTime: "07:30",
        quietStart: "21:00",
        quietEnd: "07:00",
        byType: { NEEDS_REWORK: "INSTANT", APPROVED: "DIGEST", REDEMPTION_REQUESTED: "INSTANT" },
      });
      const saved = await t.request("PATCH", url, {
        session: billySession,
        body: { digestTime: "16:00", byType: { APPROVED: "OFF" } },
      });
      expect(saved.json<NotificationSettings>()).toMatchObject({
        digestTime: "16:00",
        byType: { APPROVED: "OFF", NEEDS_REWORK: "INSTANT" },
      });
      const bad = await t.request("PATCH", url, {
        session: billySession,
        body: { digestTime: "7:30pm" },
      });
      expect(bad.statusCode).toBe(400);
    });
  });

  describe("devices", () => {
    it("registers a phone, moves it when someone else signs in, and unregisters it", async () => {
      const { mom, billySession } = await setup();
      const token = "ExponentPushToken[phone-1]";
      expect((await registerPhone(billySession, token)).statusCode).toBe(204);
      await registerPhone(mom, token);
      const device = await t.db.pushDevice.findUniqueOrThrow({ where: { expoPushToken: token } });
      expect(device.userId).toBe(mom.user.id);
      expect((await registerPhone(mom, "not-a-token")).statusCode).toBe(400);

      await t.request("DELETE", `/v1/me/devices/${encodeURIComponent(token)}`, { session: mom });
      expect(await t.db.pushDevice.count()).toBe(0);
    });
  });

  describe("sending", () => {
    it("sends instant ones right away, but not in quiet hours", async () => {
      const { mom, familyId, billy, billySession } = await setup();
      await registerPhone(billySession, "ExponentPushToken[billy]");
      const today = await choreFor(mom, familyId, billy);
      const { submission } = await submit(billySession, familyId, today.id);
      await review(mom, familyId, submission.id, { action: "REQUEST_REWORK" });

      // 06:00 in Chicago: quiet hours. Nothing goes out.
      expect(await sendInstantNotifications(jobDeps(), quiet)).toBe(0);
      expect(t.push.sent).toEqual([]);

      advance(minutes(60)); // 07:00
      expect(await sendInstantNotifications(jobDeps(), quiet)).toBe(1);
      expect(t.push.sent).toEqual([
        {
          to: "ExponentPushToken[billy]",
          title: "Try again: Dishes",
          body: "Mom sent it back for another try.",
          data: { instanceId: today.id },
        },
      ]);
      // Sent once. "New chore" is a digest kind, so it waits.
      expect(await sendInstantNotifications(jobDeps(), quiet)).toBe(0);
      expect(t.push.sent).toHaveLength(1);
    });

    it("follows each person's choice of instant, digest, or off", async () => {
      const { mom, familyId, billy, billySession } = await setup();
      await registerPhone(billySession, "ExponentPushToken[billy]");
      await t.request("PATCH", f(familyId, "/notification-settings"), {
        session: billySession,
        body: { byType: { NEW_CHORE: "INSTANT" } },
      });
      await choreFor(mom, familyId, billy);
      advance(minutes(90));
      await sendInstantNotifications(jobDeps(), quiet);
      expect(t.push.sent.map((m) => m.title)).toEqual(["New chore: Dishes"]);
    });

    it("sends one morning digest per person at their digest time, and nothing on an empty day", async () => {
      const { mom, familyId, billy, billySession, sallySession } = await setup();
      await registerPhone(billySession, "ExponentPushToken[billy]");
      await registerPhone(sallySession, "ExponentPushToken[sally]");
      await registerPhone(mom, "ExponentPushToken[mom]");
      await choreFor(mom, familyId, billy);

      // 06:00: not yet.
      expect(await sendDigests(jobDeps(), quiet)).toBe(0);
      advance(minutes(90)); // 07:30
      await sendDigests(jobDeps(), quiet);
      const byToken = new Map(t.push.sent.map((m) => [m.to, m]));
      expect(byToken.get("ExponentPushToken[billy]")).toMatchObject({
        title: "Good morning, Billy!",
        body: "1 chore today · 1 update",
      });
      // Sally had nothing: no push. Mom had nothing waiting either.
      expect(byToken.has("ExponentPushToken[sally]")).toBe(false);
      expect(byToken.has("ExponentPushToken[mom]")).toBe(false);

      // Once a day.
      const count = t.push.sent.length;
      advance(minutes(30));
      await sendDigests(jobDeps(), quiet);
      expect(t.push.sent).toHaveLength(count);

      // The next morning it goes again.
      advance(days(1));
      await sendDigests(jobDeps(), quiet);
      expect(t.push.sent.length).toBeGreaterThan(count);
    });

    it("tells parents what's waiting for review", async () => {
      const { mom, familyId, billy, billySession } = await setup();
      await registerPhone(mom, "ExponentPushToken[mom]");
      const today = await choreFor(mom, familyId, billy);
      await submit(billySession, familyId, today.id);
      advance(minutes(90));
      await sendDigests(jobDeps(), quiet);
      expect(t.push.sent).toEqual([
        expect.objectContaining({
          to: "ExponentPushToken[mom]",
          title: "Good morning, Mom!",
          body: "1 waiting for review · 1 update",
        }),
      ]);
    });

    it("forgets phones that no longer accept notifications", async () => {
      const { mom, familyId, billy, billySession } = await setup();
      await registerPhone(billySession, "ExponentPushToken[gone]");
      t.push.dead.add("ExponentPushToken[gone]");
      await choreFor(mom, familyId, billy);
      advance(minutes(90));
      await sendDigests(jobDeps(), quiet);
      expect(await t.db.pushDevice.count()).toBe(0);
    });
    it("reads delivery receipts later and forgets tokens Apple or Google reject", async () => {
      const { mom, familyId, billy, billySession } = await setup();
      // Billy has two phones; one was reset since.
      await registerPhone(billySession, "ExponentPushToken[old]");
      await registerPhone(billySession, "ExponentPushToken[new]");
      await choreFor(mom, familyId, billy);
      advance(minutes(90)); // 07:30: Billy's digest goes to both
      await sendDigests(jobDeps(), quiet);
      const tickets = await t.db.pushTicket.findMany({ orderBy: { ticketId: "asc" } });
      expect(tickets.map((x) => x.ticketId)).toEqual(["ticket-1", "ticket-2"]);

      // Receipts aren't ready for 15 minutes: nothing is asked yet.
      expect(await checkPushReceipts(jobDeps(), quiet)).toEqual({ checked: 0, deadTokens: 0 });
      expect(t.push.receiptRequests).toEqual([]);

      advance(minutes(15));
      const oldTicket = tickets.find((x) => x.expoPushToken === "ExponentPushToken[old]")!;
      const newTicket = tickets.find((x) => x.expoPushToken === "ExponentPushToken[new]")!;
      t.push.receiptsById.set(oldTicket.ticketId, { ok: false, unregistered: true });
      // The new phone's receipt isn't ready yet: its ticket waits for the next check.
      expect(await checkPushReceipts(jobDeps(), quiet)).toEqual({ checked: 1, deadTokens: 1 });
      expect((await t.db.pushDevice.findMany()).map((d) => d.expoPushToken)).toEqual([
        "ExponentPushToken[new]",
      ]);
      expect((await t.db.pushTicket.findMany()).map((x) => x.id)).toEqual([newTicket.id]);

      // A day later, a ticket with no receipt is dropped.
      advance(days(1));
      expect(await checkPushReceipts(jobDeps(), quiet)).toEqual({ checked: 0, deadTokens: 0 });
      expect(await t.db.pushTicket.count()).toBe(0);
      expect(await t.db.pushDevice.count()).toBe(1);
    });
  });
});
