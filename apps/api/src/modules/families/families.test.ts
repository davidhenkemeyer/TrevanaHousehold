import type { FamilyDetail, Member, MeResponse } from "@tenara/contracts";
import { describe, expect, it } from "vitest";
import { type Session, minutes, useTestApp } from "../../test/harness.js";

describe("families and members", () => {
  const t = useTestApp();

  /** Mom with a family and one kid profile (Billy, PIN 1234). */
  async function setup() {
    const mom = await t.signup({ displayName: "Mom" });
    const family = await t.createFamily(mom);
    const billy = await t.addChild(mom, family.family.id, { displayName: "Billy", pin: "1234" });
    const momMember = family.members[0] as Member;
    return { mom, familyId: family.family.id, momMember, billy };
  }

  const memberUrl = (familyId: string, membershipId: string) =>
    `/v1/families/${familyId}/members/${membershipId}`;

  describe("creating a family", () => {
    it("makes the creator its first parent, with default capacity", async () => {
      const mom = await t.signup({ displayName: "Mom" });
      const detail = await t.createFamily(mom, "The Smiths");
      expect(detail.family).toMatchObject({ name: "The Smiths", timeZone: "America/Chicago" });
      expect(detail.members).toHaveLength(1);
      expect(detail.members[0]).toMatchObject({
        userId: mom.user.id,
        displayName: "Mom",
        role: "PARENT",
        hasPin: false,
        hasLogin: true,
        capacity: { mon: 60, sat: 60 },
      });

      const me = (await t.request("GET", "/v1/me", { session: mom })).json<MeResponse>();
      expect(me.memberships).toEqual([
        expect.objectContaining({
          familyId: detail.family.id,
          familyName: "The Smiths",
          role: "PARENT",
        }),
      ]);
    });

    it("rejects an unknown time zone", async () => {
      const mom = await t.signup();
      const res = await t.request("POST", "/v1/families", {
        session: mom,
        body: { name: "X", timeZone: "Central Time" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("access", () => {
    it("hides a family from non-members (404, not 403)", async () => {
      const { familyId } = await setup();
      const stranger = await t.signup();
      const res = await t.request("GET", `/v1/families/${familyId}`, { session: stranger });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("FAMILY_NOT_FOUND");
    });

    it("lets kids view the family but not change it", async () => {
      const { mom, familyId, billy } = await setup();
      const kid = await t.switchTo(mom, familyId, billy.id);
      expect(
        (await t.request("GET", `/v1/families/${familyId}`, { session: kid })).statusCode,
      ).toBe(200);

      const rename = await t.request("PATCH", `/v1/families/${familyId}`, {
        session: kid,
        body: { name: "Billy's House" },
      });
      expect(rename.statusCode).toBe(403);
      expect(rename.json().error.code).toBe("PARENT_REQUIRED");
    });

    it("lets a parent rename the family and change its time zone", async () => {
      const { mom, familyId } = await setup();
      const res = await t.request("PATCH", `/v1/families/${familyId}`, {
        session: mom,
        body: { name: "Smith Family", timeZone: "America/New_York" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<FamilyDetail>().family).toMatchObject({
        name: "Smith Family",
        timeZone: "America/New_York",
      });
    });
  });

  describe("kid profiles", () => {
    it("are created without a login, with kid default capacity", async () => {
      const { billy } = await setup();
      expect(billy).toMatchObject({
        displayName: "Billy",
        role: "CHILD",
        hasPin: true,
        hasLogin: false,
        capacity: { mon: 20, sat: 40 },
      });
    });

    it("get distinct default avatar colors", async () => {
      const { mom, familyId, billy } = await setup();
      const sally = await t.addChild(mom, familyId, { displayName: "Sally" });
      expect(sally.avatarColor).not.toBe(billy.avatarColor);
    });

    it("never expose PIN hashes", async () => {
      const { mom, familyId } = await setup();
      const res = await t.request("GET", `/v1/families/${familyId}`, { session: mom });
      expect(res.body).not.toContain("argon2");
      expect(res.body).not.toContain("pinHash");
    });
  });

  describe("updating members", () => {
    it("changes capacity, name, and PIN", async () => {
      const { mom, familyId, billy } = await setup();
      const capacity = { sun: 0, mon: 15, tue: 15, wed: 15, thu: 15, fri: 15, sat: 60 };
      const res = await t.request("PATCH", memberUrl(familyId, billy.id), {
        session: mom,
        body: { capacity, displayName: "William", pin: null },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<Member>()).toMatchObject({ capacity, displayName: "William", hasPin: false });
    });

    it("refuses to make a PIN-only kid profile a parent", async () => {
      const { mom, familyId, billy } = await setup();
      const res = await t.request("PATCH", memberUrl(familyId, billy.id), {
        session: mom,
        body: { role: "PARENT" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("ROLE_REQUIRES_LOGIN");
    });

    it("refuses to demote the last parent", async () => {
      const { mom, familyId, momMember } = await setup();
      const res = await t.request("PATCH", memberUrl(familyId, momMember.id), {
        session: mom,
        body: { role: "CHILD" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("LAST_PARENT");
    });

    it("lets a parent set a PIN for quick switching on shared devices", async () => {
      const { mom, familyId, momMember } = await setup();
      const res = await t.request("PATCH", memberUrl(familyId, momMember.id), {
        session: mom,
        body: { pin: "4321" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<Member>()).toMatchObject({ role: "PARENT", hasPin: true });
    });

    it("404s for a member of another family", async () => {
      const { mom, familyId } = await setup();
      const other = await t.signup();
      const otherFamily = await t.createFamily(other);
      const outsider = otherFamily.members[0] as Member;
      const res = await t.request("PATCH", memberUrl(familyId, outsider.id), {
        session: mom,
        body: { displayName: "Hijacked" },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("removing members", () => {
    it("removes a kid and ends their sessions", async () => {
      const { mom, familyId, billy } = await setup();
      const kid = await t.switchTo(mom, familyId, billy.id);

      const res = await t.request("DELETE", memberUrl(familyId, billy.id), { session: mom });
      expect(res.statusCode).toBe(204);

      const detail = (
        await t.request("GET", `/v1/families/${familyId}`, { session: mom })
      ).json<FamilyDetail>();
      expect(detail.members.map((m) => m.displayName)).toEqual(["Mom"]);
      // Their access token no longer reaches the family, and the refresh token is dead.
      expect(
        (await t.request("GET", `/v1/families/${familyId}`, { session: kid })).statusCode,
      ).toBe(404);
      const refreshed = await t.request("POST", "/v1/auth/refresh", {
        body: { refreshToken: kid.tokens.refreshToken },
      });
      expect(refreshed.statusCode).toBe(401);
    });

    it("refuses to remove the last parent", async () => {
      const { mom, familyId, momMember } = await setup();
      const res = await t.request("DELETE", memberUrl(familyId, momMember.id), { session: mom });
      expect(res.statusCode).toBe(409);
    });
  });

  describe("switching to a kid profile", () => {
    const switchUrl = (familyId: string, membershipId: string) =>
      `${memberUrl(familyId, membershipId)}/session`;

    async function withSally() {
      const base = await setup();
      const sally = await t.addChild(base.mom, base.familyId, {
        displayName: "Sally",
        pin: "9876",
      });
      const billySession = await t.switchTo(base.mom, base.familyId, base.billy.id);
      return { ...base, sally, billySession };
    }

    const trySwitch = (session: Session, familyId: string, membershipId: string, pin?: string) =>
      t.request("POST", switchUrl(familyId, membershipId), {
        session,
        body: pin === undefined ? {} : { pin },
      });

    it("lets a parent hand the device to a kid without a PIN", async () => {
      const { mom, familyId, billy } = await setup();
      const kid = await t.switchTo(mom, familyId, billy.id);
      expect(kid.user.displayName).toBe("Billy");
      const me = (await t.request("GET", "/v1/me", { session: kid })).json<MeResponse>();
      expect(me.memberships[0]?.role).toBe("CHILD");
    });

    it("requires the sibling's PIN when a kid switches", async () => {
      const { familyId, sally, billySession } = await withSally();
      const missing = await trySwitch(billySession, familyId, sally.id);
      expect(missing.json().error.code).toBe("PIN_REQUIRED");
      const wrong = await trySwitch(billySession, familyId, sally.id, "0000");
      expect(wrong.json().error.code).toBe("INVALID_PIN");
      const right = await trySwitch(billySession, familyId, sally.id, "9876");
      expect(right.statusCode).toBe(200);
      expect(right.json().user.displayName).toBe("Sally");
    });

    it("locks a profile for 15 minutes after 5 wrong PINs", async () => {
      const { familyId, sally, billySession } = await withSally();
      for (let i = 0; i < 5; i++) {
        expect((await trySwitch(billySession, familyId, sally.id, "0000")).statusCode).toBe(401);
      }
      const locked = await trySwitch(billySession, familyId, sally.id, "9876");
      expect(locked.statusCode).toBe(429);
      expect(locked.json().error.code).toBe("PIN_LOCKED");

      t.advance(minutes(16));
      const billyLater = await t.refresh(billySession); // his access token expired too
      expect((await trySwitch(billyLater, familyId, sally.id, "9876")).statusCode).toBe(200);
    });

    it("a successful PIN resets the wrong-guess count", async () => {
      const { familyId, sally, billySession } = await withSally();
      for (let i = 0; i < 4; i++) await trySwitch(billySession, familyId, sally.id, "0000");
      expect((await trySwitch(billySession, familyId, sally.id, "9876")).statusCode).toBe(200);
      for (let i = 0; i < 4; i++) await trySwitch(billySession, familyId, sally.id, "0000");
      expect((await trySwitch(billySession, familyId, sally.id, "9876")).statusCode).toBe(200);
    });

    it("can't switch to a parent who has no PIN", async () => {
      const { familyId, momMember, billySession } = await withSally();
      const res = await trySwitch(billySession, familyId, momMember.id, "1234");
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("PARENT_PIN_NOT_SET");
    });

    it("hands a shared device back to a parent with the parent's PIN", async () => {
      const { mom, familyId, momMember, billySession } = await withSally();
      await t.request("PATCH", memberUrl(familyId, momMember.id), {
        session: mom,
        body: { pin: "2468" },
      });
      expect((await trySwitch(billySession, familyId, momMember.id)).json().error.code).toBe(
        "PIN_REQUIRED",
      );
      expect((await trySwitch(billySession, familyId, momMember.id, "1111")).statusCode).toBe(401);
      const back = await trySwitch(billySession, familyId, momMember.id, "2468");
      expect(back.statusCode).toBe(200);
      expect(back.json().user.displayName).toBe("Mom");
    });

    it("locks a parent's PIN after 5 wrong guesses too", async () => {
      const { mom, familyId, momMember, billySession } = await withSally();
      await t.request("PATCH", memberUrl(familyId, momMember.id), {
        session: mom,
        body: { pin: "2468" },
      });
      for (let i = 0; i < 5; i++) await trySwitch(billySession, familyId, momMember.id, "0000");
      const locked = await trySwitch(billySession, familyId, momMember.id, "2468");
      expect(locked.json().error.code).toBe("PIN_LOCKED");
    });

    it("switching to yourself never needs a PIN", async () => {
      const { mom, familyId, momMember } = await withSally();
      await t.request("PATCH", memberUrl(familyId, momMember.id), {
        session: mom,
        body: { pin: "2468" },
      });
      expect((await trySwitch(mom, familyId, momMember.id)).statusCode).toBe(200);
    });
  });
});
