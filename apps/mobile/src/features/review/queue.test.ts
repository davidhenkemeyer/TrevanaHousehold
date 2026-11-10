import type { ReviewQueueItem } from "@titan/contracts";
import { describe, expect, it } from "vitest";
import { batchEligibleIds, describeBatchResult, groupByChild } from "./queue";

const billy = { membershipId: "b", displayName: "Billy", avatarColor: "#0284C7" };
const sally = { membershipId: "s", displayName: "Sally", avatarColor: "#059669" };

function item(id: string, who: typeof billy, batchEligible = true): ReviewQueueItem {
  return {
    submission: {
      id,
      instanceId: `i-${id}`,
      submittedBy: who,
      submittedAt: "2026-11-10T20:00:00.000Z",
      checklist: [],
      checklistSummary: { checked: 0, total: 0 },
      photoCount: 0,
      reviews: [],
    },
    instance: {
      id: `i-${id}`,
      choreId: "c",
      choreName: "Dishes",
      occurrenceDate: "2026-11-10" as ReviewQueueItem["instance"]["occurrenceDate"],
      isLate: false,
      rewardAmount: 0,
      reviewPolicy: batchEligible ? "BATCH_OK" : "REVIEW_EACH",
    },
    batchEligible,
  };
}

describe("review queue helpers", () => {
  it("groups by child in queue order", () => {
    const groups = groupByChild([item("1", billy), item("2", sally), item("3", billy)]);
    expect(groups.map((g) => [g.displayName, g.items.map((i) => i.submission.id)])).toEqual([
      ["Billy", ["1", "3"]],
      ["Sally", ["2"]],
    ]);
  });

  it("picks only batch-eligible submissions", () => {
    expect(batchEligibleIds([item("1", billy), item("2", sally, false)])).toEqual(["1"]);
  });

  it("describes batch results", () => {
    expect(
      describeBatchResult({
        results: [
          { submissionId: "1", ok: true },
          { submissionId: "2", ok: true },
        ],
      }),
    ).toBe("2 approved.");
    expect(
      describeBatchResult({
        results: [
          { submissionId: "1", ok: true },
          { submissionId: "2", ok: false, code: "REVIEW_INDIVIDUALLY" },
        ],
      }),
    ).toBe("1 approved; 1 needs a closer look.");
  });
});
