import type {
  Chore,
  CreateUploadResponse,
  InstanceDetail,
  ReviewQueue,
  SubmitResponse,
} from "@tenara/contracts";
import { describe, expect, it } from "vitest";
import { cleanUpPhotos } from "../../jobs/photoCleanup.js";
import { FAKE_UPLOAD_URL } from "../../test/fakeStorage.js";
import { T0, type Session, days, minutes, useTestApp } from "../../test/harness.js";

describe("photos", () => {
  const t = useTestApp();
  const quiet = { info: () => undefined };

  /** Mom, Billy, Sally; a daily chore for Billy that requires a photo. */
  async function setup(choreExtra: Record<string, unknown> = {}) {
    const mom = await t.signup({ displayName: "Mom" });
    const family = await t.createFamily(mom);
    const familyId = family.family.id;
    const billy = await t.addChild(mom, familyId, { displayName: "Billy" });
    const sally = await t.addChild(mom, familyId, { displayName: "Sally" });
    const billySession = await t.switchTo(mom, familyId, billy.id);
    const sallySession = await t.switchTo(mom, familyId, sally.id);
    const chore = await t.createChore(mom, familyId, {
      name: "Clean your room",
      assignMode: "FIXED",
      eligibleMembershipIds: [billy.id],
      requiresPhoto: true,
      ...choreExtra,
    });
    const today = (await t.agenda(mom, familyId)).items[0];
    if (!today) throw new Error("expected an occurrence today");
    return { mom, familyId, billy, sally, billySession, sallySession, chore, today };
  }

  const submit = (
    session: Session,
    familyId: string,
    instanceId: string,
    photoUploadIds: string[],
  ) =>
    t.request("POST", `/v1/families/${familyId}/instances/${instanceId}/submissions`, {
      session,
      body: { photoUploadIds },
    });

  const detail = async (session: Session, familyId: string, instanceId: string) => {
    const res = await t.request("GET", `/v1/families/${familyId}/instances/${instanceId}`, {
      session,
    });
    expect(res.statusCode).toBe(200);
    return res.json<InstanceDetail>();
  };

  describe("upload forms", () => {
    it("gives members a signed form for a key in their family's folder", async () => {
      const { familyId, billySession } = await setup();
      const res = await t.request("POST", `/v1/families/${familyId}/uploads`, {
        session: billySession,
        body: { purpose: "SUBMISSION", contentType: "image/jpeg" },
      });
      expect(res.statusCode).toBe(201);
      const form = res.json<CreateUploadResponse>();
      expect(form.url).toBe(FAKE_UPLOAD_URL);
      expect(form.fields.key).toMatch(
        new RegExp(`^submission/families/${familyId}/[0-9a-f-]+\\.jpg$`),
      );
      expect(form.maxBytes).toBe(8 * 1024 * 1024);
      expect(form.expiresAt).toBe(new Date(T0.getTime() + minutes(10)).toISOString());
    });

    it("lets only parents upload reference photos", async () => {
      const { familyId, billySession } = await setup();
      const res = await t.request("POST", `/v1/families/${familyId}/uploads`, {
        session: billySession,
        body: { purpose: "REFERENCE", contentType: "image/jpeg" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("rejects other file types and non-members", async () => {
      const { familyId, mom } = await setup();
      const gif = await t.request("POST", `/v1/families/${familyId}/uploads`, {
        session: mom,
        body: { purpose: "SUBMISSION", contentType: "image/gif" },
      });
      expect(gif.statusCode).toBe(400);
      const stranger = await t.signup();
      const res = await t.request("POST", `/v1/families/${familyId}/uploads`, {
        session: stranger,
        body: { purpose: "SUBMISSION", contentType: "image/jpeg" },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("proof photos on submissions", () => {
    it("requires a photo from a kid when the chore asks for one", async () => {
      const { familyId, billySession, today } = await setup();
      const res = await submit(billySession, familyId, today.id, []);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("PHOTO_REQUIRED");
    });

    it("accepts the kid's photo and shows it with a signed URL", async () => {
      const { familyId, billySession, today, mom } = await setup();
      const uploadId = await t.uploadPhoto(billySession, familyId);
      const res = await submit(billySession, familyId, today.id, [uploadId]);
      expect(res.statusCode).toBe(201);
      const { submission } = res.json<SubmitResponse>();
      expect(submission.photos).toHaveLength(1);
      expect(submission.photos[0]?.url).toMatch(
        /^https:\/\/storage\.test\/.*submission.*\?signed=/,
      );
      expect(submission.photosExpired).toBe(false);
      expect(JSON.stringify(submission)).not.toContain('"key"');

      // The parent sees it in the queue.
      const queue = await t.request("GET", `/v1/families/${familyId}/review-queue`, {
        session: mom,
      });
      expect(queue.json<ReviewQueue>().items[0]?.submission.photos).toHaveLength(1);
    });

    it("keeps signed URLs stable for a while, so the app's image cache works", async () => {
      const { familyId, billySession, today } = await setup();
      await submit(billySession, familyId, today.id, [await t.uploadPhoto(billySession, familyId)]);
      const first = (await detail(billySession, familyId, today.id)).submissions[0]?.photos[0]?.url;
      t.advance(minutes(1));
      const second = (await detail(billySession, familyId, today.id)).submissions[0]?.photos[0]
        ?.url;
      expect(second).toBe(first);
    });

    it("lets a parent complete without a photo", async () => {
      const { familyId, mom, today } = await setup();
      const res = await submit(mom, familyId, today.id, []);
      expect(res.statusCode).toBe(201);
      expect(res.json<SubmitResponse>().instance.status).toBe("APPROVED");
    });

    it("refuses a sibling's upload, an unfinished one, a reused one, and the wrong kind", async () => {
      const { familyId, billySession, sallySession, mom, today } = await setup();
      const code = async (ids: string[]) => {
        const res = await submit(billySession, familyId, today.id, ids);
        return [res.statusCode, res.json().error?.code];
      };
      expect(await code([await t.uploadPhoto(sallySession, familyId)])).toEqual([
        400,
        "UPLOAD_NOT_FOUND",
      ]);
      expect(await code([await t.uploadPhoto(billySession, familyId, { stored: false })])).toEqual([
        400,
        "UPLOAD_INCOMPLETE",
      ]);
      expect(
        await code([await t.uploadPhoto(billySession, familyId, { size: 9 * 1024 * 1024 })]),
      ).toEqual([400, "INVALID_PHOTO"]);
      const reference = await t.uploadPhoto(mom, familyId, { purpose: "REFERENCE" });
      expect(await code([reference])).toEqual([400, "UPLOAD_NOT_FOUND"]); // Mom's, not Billy's

      // Used once, then never again (here: on tomorrow's occurrence).
      const used = await t.uploadPhoto(billySession, familyId);
      expect((await submit(billySession, familyId, today.id, [used])).statusCode).toBe(201);
      const tomorrow = (await t.agenda(billySession, familyId, "?date=2026-11-11")).items.find(
        (i) => i.occurrenceDate === "2026-11-11",
      );
      const again = await submit(billySession, familyId, tomorrow!.id, [used]);
      expect(again.statusCode).toBe(409);
      expect(again.json().error.code).toBe("UPLOAD_ALREADY_USED");
    });

    it("accepts at most three photos, without repeats", async () => {
      const { familyId, billySession, today } = await setup();
      const ids = [];
      for (let i = 0; i < 4; i++) ids.push(await t.uploadPhoto(billySession, familyId));
      expect((await submit(billySession, familyId, today.id, ids)).statusCode).toBe(400);
      const one = ids[0]!;
      expect((await submit(billySession, familyId, today.id, [one, one])).statusCode).toBe(400);
      expect((await submit(billySession, familyId, today.id, ids.slice(0, 3))).statusCode).toBe(
        201,
      );
    });

    it("lets the parent put pins on the photo, which the kid sees", async () => {
      const { familyId, billySession, mom, today } = await setup();
      const res = await submit(billySession, familyId, today.id, [
        await t.uploadPhoto(billySession, familyId),
      ]);
      const submissionId = res.json<SubmitResponse>().submission.id;
      const annotations = {
        pins: [{ pin: 1, xPercent: 40, yPercent: 62.5, comment: "Socks under the bed" }],
      };
      const review = await t.request(
        "POST",
        `/v1/families/${familyId}/submissions/${submissionId}/review`,
        { session: mom, body: { action: "REQUEST_REWORK", annotations } },
      );
      expect(review.statusCode).toBe(200);
      const d = await detail(billySession, familyId, today.id);
      expect(d.latestReview?.annotations).toEqual(annotations);
    });
  });

  describe("reference photos", () => {
    it("sets, shows, replaces, and removes a chore's reference photo", async () => {
      const mom = await t.signup();
      const familyId = (await t.createFamily(mom)).family.id;
      const first = await t.uploadPhoto(mom, familyId, { purpose: "REFERENCE" });
      const created = await t.createChore(mom, familyId, { referencePhotoUploadId: first });
      expect(created.referencePhotoUrl).toMatch(/reference/);

      // Kids see it on the occurrence ("make it look like this").
      const today = (await t.agenda(mom, familyId)).items[0];
      expect(today?.referencePhotoUrl).toBe(created.referencePhotoUrl);

      const second = await t.uploadPhoto(mom, familyId, { purpose: "REFERENCE" });
      const patch = (body: object) =>
        t.request("PATCH", `/v1/families/${familyId}/chores/${created.id}`, { session: mom, body });
      const replaced = (await patch({ referencePhotoUploadId: second })).json<Chore>();
      expect(replaced.referencePhotoUrl).not.toBe(created.referencePhotoUrl);

      const removed = (await patch({ referencePhotoUploadId: null })).json<Chore>();
      expect(removed.referencePhotoUrl).toBeNull();

      // A submission upload can't be used as a reference photo.
      const proof = await t.uploadPhoto(mom, familyId);
      const wrong = await patch({ referencePhotoUploadId: proof });
      expect(wrong.json().error.code).toBe("UPLOAD_WRONG_PURPOSE");
    });

    it("shows the reference photo next to submissions in the queue", async () => {
      const { familyId, mom, billySession, chore, today } = await setup();
      const ref = await t.uploadPhoto(mom, familyId, { purpose: "REFERENCE" });
      await t.request("PATCH", `/v1/families/${familyId}/chores/${chore.id}`, {
        session: mom,
        body: { referencePhotoUploadId: ref },
      });
      await submit(billySession, familyId, today.id, [await t.uploadPhoto(billySession, familyId)]);
      const queue = await t.request("GET", `/v1/families/${familyId}/review-queue`, {
        session: mom,
      });
      expect(queue.json<ReviewQueue>().items[0]?.instance.referencePhotoUrl).toMatch(/reference/);
    });
  });

  describe("cleanup", () => {
    const run = () =>
      cleanUpPhotos(
        { db: t.db, storage: t.storage, now: () => T0, config: { photoRetentionDays: 90 } },
        quiet,
      );

    it("deletes proof photos 90 days after review and marks them expired", async () => {
      const { familyId, billySession, mom, today } = await setup();
      const res = await submit(billySession, familyId, today.id, [
        await t.uploadPhoto(billySession, familyId),
      ]);
      const { submission } = res.json<SubmitResponse>();
      await t.request("POST", `/v1/families/${familyId}/submissions/${submission.id}/review`, {
        session: mom,
        body: { action: "APPROVE" },
      });
      const key = [...t.storage.objects.keys()][0]!;

      // Reviewed 89 days ago: kept.
      await t.db.review.updateMany({ data: { createdAt: new Date(T0.getTime() - days(89)) } });
      expect((await run()).expiredSubmissions).toBe(0);

      // Reviewed 91 days ago: deleted.
      await t.db.review.updateMany({ data: { createdAt: new Date(T0.getTime() - days(91)) } });
      expect((await run()).expiredSubmissions).toBe(1);
      expect(t.storage.deleted).toContain(key);
      const s = (await detail(billySession, familyId, today.id)).submissions[0];
      expect(s?.photos).toEqual([]);
      expect(s?.photosExpired).toBe(true);
      expect(await t.db.upload.count()).toBe(0);
    });

    it("keeps photos still waiting for review", async () => {
      const { familyId, billySession, today } = await setup();
      await submit(billySession, familyId, today.id, [await t.uploadPhoto(billySession, familyId)]);
      t.advance(days(200));
      expect((await run()).expiredSubmissions).toBe(0);
      expect(t.storage.objects.size).toBe(1);
    });

    it("deletes uploads never attached after a day, and replaced reference photos", async () => {
      const { familyId, billySession, mom, chore } = await setup();
      await t.uploadPhoto(billySession, familyId); // abandoned
      const oldRef = await t.uploadPhoto(mom, familyId, { purpose: "REFERENCE" });
      const patch = (id: string) =>
        t.request("PATCH", `/v1/families/${familyId}/chores/${chore.id}`, {
          session: mom,
          body: { referencePhotoUploadId: id },
        });
      await patch(oldRef);
      await patch(await t.uploadPhoto(mom, familyId, { purpose: "REFERENCE" }));

      // Uploads were made at T0; run a day and a minute later.
      const later = await cleanUpPhotos(
        {
          db: t.db,
          storage: t.storage,
          now: () => new Date(T0.getTime() + days(1) + minutes(1)),
          config: { photoRetentionDays: 90 },
        },
        quiet,
      );
      expect(later).toEqual({ expiredSubmissions: 0, unusedUploads: 1, replacedReferences: 1 });
      // Only the current reference photo is left.
      expect(t.storage.objects.size).toBe(1);
      const current = await t.db.chore.findUniqueOrThrow({ where: { id: chore.id } });
      expect(t.storage.objects.has(current.referencePhotoKey!)).toBe(true);
    });
  });
});
