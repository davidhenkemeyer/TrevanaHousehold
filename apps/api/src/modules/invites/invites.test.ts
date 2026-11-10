import type { CreateInviteResponse, FamilyDetail, InviteList, MeResponse } from "@titan/contracts";
import { describe, expect, it } from "vitest";
import { type Session, days, useTestApp } from "../../test/harness.js";

describe("invites", () => {
  const t = useTestApp();

  async function invite(parent: Session, familyId: string, email: string, role = "PARENT") {
    const res = await t.request("POST", `/v1/families/${familyId}/invites`, {
      session: parent,
      body: { email, role },
    });
    expect(res.statusCode).toBe(201);
    return res.json<CreateInviteResponse>();
  }

  const accept = (session: Session, token: string) =>
    t.request("POST", "/v1/invites/accept", { session, body: { token } });

  async function setup() {
    const mom = await t.signup({ email: "mom@example.com", displayName: "Mom" });
    const family = await t.createFamily(mom);
    return { mom, familyId: family.family.id };
  }

  it("lets a second parent join with the invited email", async () => {
    const { mom, familyId } = await setup();
    const { token, invite: created } = await invite(mom, familyId, "Dad@Example.com");
    expect(created.email).toBe("dad@example.com");

    const dad = await t.signup({ email: "dad@example.com", displayName: "Dad" });
    const res = await accept(dad, token);
    expect(res.statusCode).toBe(200);
    expect(res.json().familyId).toBe(familyId);

    const detail = (
      await t.request("GET", `/v1/families/${familyId}`, { session: dad })
    ).json<FamilyDetail>();
    expect(detail.members.map((m) => [m.displayName, m.role])).toEqual([
      ["Mom", "PARENT"],
      ["Dad", "PARENT"],
    ]);
  });

  it("lets an older kid with their own login join as a child", async () => {
    const { mom, familyId } = await setup();
    const { token } = await invite(mom, familyId, "teen@example.com", "CHILD");
    const teen = await t.signup({ email: "teen@example.com" });
    expect((await accept(teen, token)).statusCode).toBe(200);
    const me = (await t.request("GET", "/v1/me", { session: teen })).json<MeResponse>();
    expect(me.memberships[0]).toMatchObject({ familyId, role: "CHILD" });
  });

  it("can't be accepted by a different email address", async () => {
    const { mom, familyId } = await setup();
    const { token } = await invite(mom, familyId, "dad@example.com");
    const someoneElse = await t.signup({ email: "eve@example.com" });
    const res = await accept(someoneElse, token);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("INVITE_EMAIL_MISMATCH");
  });

  it("works only once", async () => {
    const { mom, familyId } = await setup();
    const { token } = await invite(mom, familyId, "dad@example.com");
    const dad = await t.signup({ email: "dad@example.com" });
    expect((await accept(dad, token)).statusCode).toBe(200);
    expect((await accept(dad, token)).json().error.code).toBe("INVALID_INVITE");
  });

  it("expires after 7 days", async () => {
    const { mom, familyId } = await setup();
    const { token } = await invite(mom, familyId, "dad@example.com");
    const dad = await t.signup({ email: "dad@example.com" });
    t.advance(days(7) + 1000);
    const dadLater = await t.refresh(dad); // his access token expired too
    expect((await accept(dadLater, token)).json().error.code).toBe("INVALID_INVITE");
  });

  it("can be revoked, and a re-invite replaces the earlier one", async () => {
    const { mom, familyId } = await setup();
    const first = await invite(mom, familyId, "dad@example.com");
    const second = await invite(mom, familyId, "dad@example.com");

    const list = (
      await t.request("GET", `/v1/families/${familyId}/invites`, { session: mom })
    ).json<InviteList>();
    expect(list.invites.map((i) => i.id)).toEqual([second.invite.id]);

    const revoke = await t.request(
      "DELETE",
      `/v1/families/${familyId}/invites/${second.invite.id}`,
      {
        session: mom,
      },
    );
    expect(revoke.statusCode).toBe(204);

    const dad = await t.signup({ email: "dad@example.com" });
    expect((await accept(dad, first.token)).statusCode).toBe(400);
    expect((await accept(dad, second.token)).statusCode).toBe(400);
  });

  it("refuses to invite someone who is already a member", async () => {
    const { mom, familyId } = await setup();
    const res = await t.request("POST", `/v1/families/${familyId}/invites`, {
      session: mom,
      body: { email: "mom@example.com", role: "PARENT" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("is parent-only", async () => {
    const { mom, familyId } = await setup();
    const billy = await t.addChild(mom, familyId);
    const kid = await t.switchTo(mom, familyId, billy.id);
    const res = await t.request("POST", `/v1/families/${familyId}/invites`, {
      session: kid,
      body: { email: "friend@example.com", role: "CHILD" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("lets a removed member rejoin, keeping their points", async () => {
    const { mom, familyId } = await setup();
    const dad = await t.signup({ email: "dad@example.com" });
    const { membershipId } = (
      await accept(dad, (await invite(mom, familyId, "dad@example.com")).token)
    ).json();
    await t.db.membership.update({ where: { id: membershipId }, data: { pointsBalance: 42 } });
    expect(
      (
        await t.request("DELETE", `/v1/families/${familyId}/members/${membershipId}`, {
          session: mom,
        })
      ).statusCode,
    ).toBe(204);

    const rejoin = await accept(dad, (await invite(mom, familyId, "dad@example.com")).token);
    expect(rejoin.json().membershipId).toBe(membershipId);
    const row = await t.db.membership.findUniqueOrThrow({ where: { id: membershipId } });
    expect(row).toMatchObject({ active: true, pointsBalance: 42 });
  });
});
