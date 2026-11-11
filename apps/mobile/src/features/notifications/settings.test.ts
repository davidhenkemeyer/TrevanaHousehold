import { describe, expect, it } from "vitest";
import { describeType, targetOf, typesFor } from "./settings";

describe("notification settings helpers", () => {
  it("shows kids only the kinds that can reach them", () => {
    expect(typesFor("CHILD")).not.toContain("SUBMITTED");
    expect(typesFor("CHILD")).not.toContain("REDEMPTION_REQUESTED");
    expect(typesFor("CHILD")).toContain("NEEDS_REWORK");
    expect(typesFor("PARENT")).toContain("SUBMITTED");
  });

  it("describes kinds in plain words", () => {
    expect(describeType("NEEDS_REWORK")).toBe("When something is sent back to try again");
  });

  it("knows where a notification leads", () => {
    const base = { instanceId: null, redemptionId: null };
    expect(targetOf({ ...base, type: "APPROVED", instanceId: "i1" })).toEqual({
      pathname: "/chore/[id]",
      params: { id: "i1" },
    });
    expect(targetOf({ ...base, type: "REDEMPTION_REQUESTED", redemptionId: "r" })).toBe("/review");
    expect(targetOf({ ...base, type: "BADGE_EARNED" })).toBe("/rewards");
    expect(targetOf({ ...base, type: "NEW_CHORE" })).toBeNull();
  });
});
