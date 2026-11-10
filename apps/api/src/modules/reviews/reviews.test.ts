import type {
  BatchApproveResponse,
  Instance,
  InstanceDetail,
  Member,
  ReviewQueue,
  ReviewResponse,
  SubmitResponse,
} from "@titan/contracts";
import { describe, expect, it } from "vitest";
import { type Session, useTestApp } from "../../test/harness.js";

describe("reviews", () => {
  const t = useTestApp();

  async function setup() {
    const mom = await t.signup({ displayName: "Mom" });
    const family = await t.createFamily(mom);
    const familyId = family.family.id;
    const billy = await t.addChild(mom, familyId, { displayName: "Billy" });
    const billySession = await t.switchTo(mom, familyId, billy.id);
    return { mom, familyId, billy, billySession };
  }

  /** Creates a chore for `owner` and submits today's occurrence as `kid`. */
  async function submitted(
    parent: Session,
    kid: Session,
    familyId: string,
    owner: Member,
    extra: Record<string, unknown> = {},
  ) {
    const chore = await t.createChore(parent, familyId, {
      assignMode: "FIXED",
      eligibleMembershipIds: [owner.id],
      ...extra,
    });
    const today = (await t.agenda(parent, familyId)).items.find((i) => i.choreId === chore.id);
    const res = await t.request(
      "POST",
      `/v1/families/${familyId}/instances/${today?.id}/submissions`,
      { session: kid, body: { checklist: [] } },
    );
    expect(res.statusCode).toBe(201);
    return res.json<SubmitResponse>();
  }

  const review = (session: Session, familyId: string, submissionId: string, body: object) =>
    t.request("POST", `/v1/families/${familyId}/submissions/${submissionId}/review`, {
      session,
      body,
    });

  const queue = async (session: Session, familyId: string, query = "") => {
    const res = await t.request("GET", `/v1/families/${familyId}/review-queue${query}`, {
      session,
    });
    expect(res.statusCode).toBe(200);
    return res.json<ReviewQueue>();
  };

  it("lists pending submissions and approves them", async () => {
    const { mom, familyId, billy, billySession } = await setup();
    const { submission } = await submitted(mom, billySession, familyId, billy, {
      rewardAmount: 200,
    });

    const pending = await queue(mom, familyId);
    expect(pending.total).toBe(1);
    expect(pending.items[0]).toMatchObject({
      submission: { id: submission.id, submittedBy: { displayName: "Billy" } },
      instance: { choreName: "Dishes", rewardAmount: 200, reviewPolicy: "REVIEW_EACH" },
      batchEligible: false,
    });

    const res = await review(mom, familyId, submission.id, { action: "APPROVE" });
    expect(res.statusCode).toBe(200);
    expect(res.json<ReviewResponse>().instance.status).toBe("APPROVED");
    expect((await queue(mom, familyId)).total).toBe(0);
  });

  it("rework sends it back with feedback, and the history keeps both attempts", async () => {
    const { mom, familyId, billy, billySession } = await setup();
    const first = await submitted(mom, billySession, familyId, billy);

    const rework = await review(mom, familyId, first.submission.id, {
      action: "REQUEST_REWORK",
      note: "Shoes are still under the desk.",
    });
    const reopened = rework.json<ReviewResponse>().instance;
    expect(reopened).toMatchObject({
      status: "NEEDS_REWORK",
      priority: "HIGH",
      latestReview: { action: "REQUEST_REWORK", note: "Shoes are still under the desk." },
    });

    // Billy sees the feedback and can try again.
    const forBilly = (await t.agenda(billySession, familyId)).items[0] as Instance;
    expect(forBilly.latestReview?.note).toBe("Shoes are still under the desk.");
    expect(forBilly.availableActions).toEqual(["start", "complete"]);
    const second = await t.request(
      "POST",
      `/v1/families/${familyId}/instances/${forBilly.id}/submissions`,
      { session: billySession, body: {} },
    );
    const secondId = second.json<SubmitResponse>().submission.id;

    // The old submission can no longer be decided on.
    const stale = await review(mom, familyId, first.submission.id, { action: "APPROVE" });
    expect(stale.json().error.code).toBe("ALREADY_REVIEWED");

    await review(mom, familyId, secondId, { action: "APPROVE" });
    const detail = (
      await t.request("GET", `/v1/families/${familyId}/instances/${forBilly.id}`, { session: mom })
    ).json<InstanceDetail>();
    expect(detail.status).toBe("APPROVED");
    expect(detail.submissions.map((s) => s.reviews.map((r) => r.action))).toEqual([
      ["REQUEST_REWORK"],
      ["APPROVE"],
    ]);
    expect(detail.events.map((e) => e.toStatus)).toEqual([
      "PENDING_REVIEW",
      "NEEDS_REWORK",
      "PENDING_REVIEW",
      "APPROVED",
    ]);
  });

  it("rejection is final", async () => {
    const { mom, familyId, billy, billySession } = await setup();
    const { submission, instance } = await submitted(mom, billySession, familyId, billy);
    const res = await review(mom, familyId, submission.id, {
      action: "REJECT",
      note: "Not your photo.",
    });
    expect(res.json<ReviewResponse>().instance.status).toBe("REJECTED");
    const retry = await t.request(
      "POST",
      `/v1/families/${familyId}/instances/${instance.id}/actions`,
      { session: billySession, body: { action: "start" } },
    );
    expect(retry.json().error.code).toBe("TERMINAL");
  });

  it("validates pins, and needs a photo for them", async () => {
    const { mom, familyId, billy, billySession } = await setup();
    const { submission } = await submitted(mom, billySession, familyId, billy);
    const outOfRange = await review(mom, familyId, submission.id, {
      action: "REQUEST_REWORK",
      annotations: { pins: [{ pin: 1, xPercent: 120, yPercent: 50, comment: "Here" }] },
    });
    expect(outOfRange.statusCode).toBe(400);
    expect(outOfRange.json().error.code).toBe("VALIDATION_ERROR");

    const noPhoto = await review(mom, familyId, submission.id, {
      action: "REQUEST_REWORK",
      annotations: { pins: [{ pin: 1, xPercent: 42.5, yPercent: 68.1, comment: "Shoes" }] },
    });
    expect(noPhoto.json().error.code).toBe("ANNOTATIONS_NEED_PHOTO");
  });

  it("is parent-only", async () => {
    const { mom, familyId, billy, billySession } = await setup();
    const { submission } = await submitted(mom, billySession, familyId, billy);
    expect(
      (await t.request("GET", `/v1/families/${familyId}/review-queue`, { session: billySession }))
        .statusCode,
    ).toBe(403);
    expect(
      (await review(billySession, familyId, submission.id, { action: "APPROVE" })).statusCode,
    ).toBe(403);
  });

  it("batch approval skips chores that need individual review", async () => {
    const { mom, familyId, billy, billySession } = await setup();
    const easy = await submitted(mom, billySession, familyId, billy, {
      name: "Make bed",
      reviewPolicy: "BATCH_OK",
    });
    const paid = await submitted(mom, billySession, familyId, billy, {
      name: "Mow lawn",
      rewardAmount: 1000,
    });

    const pending = await queue(mom, familyId);
    expect(pending.items.filter((i) => i.batchEligible).map((i) => i.instance.choreName)).toEqual([
      "Make bed",
    ]);

    const res = await t.request("POST", `/v1/families/${familyId}/review-queue/approve`, {
      session: mom,
      body: { submissionIds: [easy.submission.id, paid.submission.id] },
    });
    expect(res.json<BatchApproveResponse>().results).toEqual([
      { submissionId: easy.submission.id, ok: true },
      expect.objectContaining({
        submissionId: paid.submission.id,
        ok: false,
        code: "REVIEW_INDIVIDUALLY",
      }),
    ]);
    const left = await queue(mom, familyId);
    expect(left.items.map((i) => i.instance.choreName)).toEqual(["Mow lawn"]);
  });

  it("paginates the queue, newest first, with a total", async () => {
    const { mom, familyId, billy, billySession } = await setup();
    for (const name of ["One", "Two", "Three"]) {
      await submitted(mom, billySession, familyId, billy, { name });
      t.advance(1000); // distinct submission times
    }
    const page1 = await queue(mom, familyId, "?limit=2");
    expect(page1.total).toBe(3);
    expect(page1.items.map((i) => i.instance.choreName)).toEqual(["Three", "Two"]);
    const page2 = await queue(mom, familyId, `?limit=2&cursor=${page1.nextCursor}`);
    expect(page2.items.map((i) => i.instance.choreName)).toEqual(["One"]);
    expect(page2.nextCursor).toBeNull();
  });
});
