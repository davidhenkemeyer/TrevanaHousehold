import type { Instance, InstanceDetail, InstanceList, Member } from "@titan/contracts";
import { describe, expect, it } from "vitest";
import { type Session, minutes, useTestApp } from "../test/harness.js";
import { testDatabaseUrl } from "../test/testDatabase.js";
import { JOBS, startJobs } from "./index.js";
import { markLateInstances } from "./lateness.js";
import { planAllFamilies } from "./planning.js";

const quiet = { info() {}, warn() {}, error() {} };

describe("background jobs", () => {
  const t = useTestApp();
  let clock = new Date("2026-11-10T12:00:00.000Z"); // mirrors the harness clock for direct calls
  const deps = () => ({ db: t.db, now: () => clock });
  const advance = (ms: number) => {
    t.advance(ms);
    clock = new Date(clock.getTime() + ms);
  };

  /** Mom and Billy; Billy owns a daily chore due 12 hours after local midnight (18:00 UTC). */
  async function setup() {
    clock = new Date("2026-11-10T12:00:00.000Z");
    const mom = await t.signup({ displayName: "Mom" });
    const family = await t.createFamily(mom);
    const familyId = family.family.id;
    const billy = await t.addChild(mom, familyId, { displayName: "Billy" });
    const billySession = await t.switchTo(mom, familyId, billy.id);
    await t.createChore(mom, familyId, {
      assignMode: "FIXED",
      eligibleMembershipIds: [billy.id],
    });
    return { mom, familyId, billy, billySession };
  }

  const today = async (session: Session, familyId: string) =>
    (await t.agenda(session, familyId)).items[0] as Instance;

  describe("late marking", () => {
    it("flags overdue chores once, as HIGH priority, with a system event", async () => {
      const { mom, familyId } = await setup();
      expect(await markLateInstances(deps(), quiet)).toBe(0); // not due until 18:00 UTC

      advance(minutes(7 * 60)); // 19:00 UTC
      expect(await markLateInstances(deps(), quiet)).toBe(1);
      expect(await markLateInstances(deps(), quiet)).toBe(0); // never twice

      const session = await t.refresh(mom);
      const late = await today(session, familyId);
      expect(late).toMatchObject({ isLate: true, priority: "HIGH", status: "NEW" });
      const detail = (
        await t.request("GET", `/v1/families/${familyId}/instances/${late.id}`, { session })
      ).json<InstanceDetail>();
      expect(detail.events).toEqual([
        expect.objectContaining({
          action: "markLate",
          fromStatus: "NEW",
          toStatus: "NEW",
          actor: null,
        }),
      ]);
    });

    it("leaves submitted and finished chores alone", async () => {
      const { mom, familyId, billySession } = await setup();
      const chore = await today(mom, familyId);
      await t.request("POST", `/v1/families/${familyId}/instances/${chore.id}/submissions`, {
        session: billySession,
        body: {},
      });
      advance(minutes(7 * 60));
      expect(await markLateInstances(deps(), quiet)).toBe(0);
    });

    it("still lets the kid finish a late chore", async () => {
      const { familyId, billySession } = await setup();
      advance(minutes(7 * 60));
      await markLateInstances(deps(), quiet);
      const kid = await t.refresh(billySession);
      const chore = await today(kid, familyId);
      expect(chore.availableActions).toContain("complete");
      const res = await t.request(
        "POST",
        `/v1/families/${familyId}/instances/${chore.id}/submissions`,
        { session: kid, body: {} },
      );
      expect(res.statusCode).toBe(201);
    });
  });

  describe("scheduled planning", () => {
    it("rolls the 7-day window forward as days pass", async () => {
      const { mom, familyId } = await setup();
      advance(minutes(3 * 24 * 60)); // Friday
      const summary = await planAllFamilies(deps(), quiet);
      expect(summary).toEqual({ families: 1, created: 3, failed: 0 });

      const session = await t.refresh(mom);
      const res = await t.request(
        "GET",
        `/v1/families/${familyId}/instances?from=2026-11-01&to=2026-11-30`,
        { session },
      );
      const dates = res.json<InstanceList>().items.map((i) => i.occurrenceDate);
      expect(dates.at(0)).toBe("2026-11-10");
      expect(dates.at(-1)).toBe("2026-11-19"); // Friday + 6 days
      expect(dates).toHaveLength(10);
    });

    it("plans every family, skipping a chore whose stored rule is corrupt", async () => {
      await setup();
      const other = await t.signup({ displayName: "Other parent" });
      const otherFamily = await t.createFamily(other, "The Others");
      const otherOwner = otherFamily.members[0] as Member;
      const broken = await t.createChore(other, otherFamily.family.id, {
        name: "Broken",
        assignMode: "FIXED",
        eligibleMembershipIds: [otherOwner.id],
      });
      await t.db.chore.update({
        where: { id: broken.id },
        data: { recurrence: { freq: "SOMETIMES" } },
      });

      advance(minutes(24 * 60));
      const summary = await planAllFamilies(deps(), quiet);
      // The healthy family gets its new day; the corrupt chore is skipped, not fatal.
      expect(summary).toEqual({ families: 2, created: 1, failed: 0 });
    });
  });

  describe("pg-boss wiring", () => {
    it("registers both schedules and stops cleanly", async () => {
      const jobs = await startJobs(
        {
          db: t.db,
          storage: t.storage,
          now: () => clock,
          config: { databaseUrl: testDatabaseUrl(), photoRetentionDays: 90 },
        },
        t.app.log,
        { schema: "pgboss_test" },
      );
      try {
        const schedules = await jobs.boss.getSchedules();
        expect(schedules.map((s) => [s.name, s.cron]).sort()).toEqual(
          [
            [JOBS.markLate.name, JOBS.markLate.cron],
            [JOBS.planFamilies.name, JOBS.planFamilies.cron],
            [JOBS.cleanUpPhotos.name, JOBS.cleanUpPhotos.cron],
          ].sort(),
        );
      } finally {
        await jobs.stop();
      }
    });
  });
});
