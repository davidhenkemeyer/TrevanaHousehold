import type { AuthResponse, Member, MeResponse, PairingCodeResponse } from "@tenara/contracts";
import { describe, expect, it } from "vitest";
import { type Session, minutes, useTestApp } from "../../test/harness.js";

describe("pairing a kid's own phone", () => {
  const t = useTestApp();

  async function setup() {
    const mom = await t.signup({ displayName: "Mom" });
    const family = await t.createFamily(mom);
    const familyId = family.family.id;
    const billy = await t.addChild(mom, familyId, { displayName: "Billy" });
    return { mom, familyId, billy, momMember: family.members[0] as Member };
  }

  const issue = (session: Session, familyId: string, membershipId: string) =>
    t.request("POST", `/v1/families/${familyId}/members/${membershipId}/pairing-code`, { session });

  const pair = (code: string) => t.request("POST", "/v1/auth/pair", { body: { code } });

  it("signs the kid's phone in as the kid, without the parent's password", async () => {
    const { mom, familyId, billy } = await setup();
    const res = await issue(mom, familyId, billy.id);
    expect(res.statusCode).toBe(201);
    const { code, expiresAt } = res.json<PairingCodeResponse>();
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(new Date(expiresAt).getTime() - Date.parse("2026-11-10T12:00:00Z")).toBe(minutes(10));

    // Typed casually on the phone: lowercase, a space instead of the dash.
    const paired = await pair(code.toLowerCase().replace("-", " "));
    expect(paired.statusCode).toBe(200);
    const auth = paired.json<AuthResponse>();
    expect(auth.user.displayName).toBe("Billy");

    const me = await t.app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${auth.tokens.accessToken}` },
    });
    expect(me.json<MeResponse>().memberships[0]).toMatchObject({ familyId, role: "CHILD" });
  });

  it("works only once", async () => {
    const { mom, familyId, billy } = await setup();
    const { code } = (await issue(mom, familyId, billy.id)).json<PairingCodeResponse>();
    expect((await pair(code)).statusCode).toBe(200);
    expect((await pair(code)).json().error.code).toBe("INVALID_PAIRING_CODE");
  });

  it("expires after 10 minutes", async () => {
    const { mom, familyId, billy } = await setup();
    const { code } = (await issue(mom, familyId, billy.id)).json<PairingCodeResponse>();
    t.advance(minutes(10) + 1000);
    expect((await pair(code)).json().error.code).toBe("INVALID_PAIRING_CODE");
  });

  it("is replaced by a newer code for the same kid", async () => {
    const { mom, familyId, billy } = await setup();
    const first = (await issue(mom, familyId, billy.id)).json<PairingCodeResponse>();
    const second = (await issue(mom, familyId, billy.id)).json<PairingCodeResponse>();
    expect((await pair(first.code)).statusCode).toBe(400);
    expect((await pair(second.code)).statusCode).toBe(200);
  });

  it("stops working if the kid is removed from the family", async () => {
    const { mom, familyId, billy } = await setup();
    const { code } = (await issue(mom, familyId, billy.id)).json<PairingCodeResponse>();
    await t.request("DELETE", `/v1/families/${familyId}/members/${billy.id}`, { session: mom });
    expect((await pair(code)).statusCode).toBe(400);
  });

  it("is only for kid profiles, and only parents can issue codes", async () => {
    const { mom, familyId, billy, momMember } = await setup();
    expect((await issue(mom, familyId, momMember.id)).json().error.code).toBe("PAIRING_KIDS_ONLY");
    const kid = await t.switchTo(mom, familyId, billy.id);
    expect((await issue(kid, familyId, billy.id)).statusCode).toBe(403);
  });

  it("rejects malformed codes before looking anything up", async () => {
    expect((await pair("not a code")).statusCode).toBe(400);
    expect((await pair("ABCD-0000")).json().error.code).toBe("VALIDATION_ERROR"); // 0 isn't in the alphabet
  });
});
