import { ROOMS } from "@tenara/domain";
import { describe, expect, it } from "vitest";
import {
  AGE_GROUP_OPTIONS,
  canSkip,
  describeKidTime,
  nextStep,
  previousStep,
  stepLabel,
  toggleRoom,
} from "./flow";

describe("setup flow", () => {
  it("walks forward and stops at done", () => {
    expect(nextStep("family")).toBe("kids");
    expect(nextStep("rewards")).toBe("done");
    expect(nextStep("done")).toBe("done");
  });

  it("can't go back to the family once it exists", () => {
    expect(previousStep("family")).toBeUndefined();
    expect(previousStep("kids")).toBeUndefined();
    expect(previousStep("rooms")).toBe("kids");
    expect(previousStep("rewards")).toBe("rooms");
    expect(previousStep("done")).toBeUndefined();
  });

  it("lets every step after the family be skipped", () => {
    expect(canSkip("family")).toBe(false);
    expect(canSkip("kids")).toBe(true);
    expect(canSkip("rooms")).toBe(true);
    expect(canSkip("rewards")).toBe(true);
    expect(canSkip("done")).toBe(false);
  });

  it("counts four steps", () => {
    expect(stepLabel("family")).toBe("Step 1 of 4");
    expect(stepLabel("rewards")).toBe("Step 4 of 4");
    expect(stepLabel("done")).toBeUndefined();
  });

  it("toggles rooms and keeps them in list order", () => {
    expect(toggleRoom(["KITCHEN"], "EVERYDAY", ROOMS)).toEqual(["EVERYDAY", "KITCHEN"]);
    expect(toggleRoom(["EVERYDAY", "KITCHEN"], "EVERYDAY", ROOMS)).toEqual(["KITCHEN"]);
  });

  it("describes a kid's daily time", () => {
    expect(describeKidTime({ sun: 20, mon: 10, tue: 10, wed: 10, thu: 10, fri: 10, sat: 20 })).toBe(
      "10 min on school days, 20 on weekends",
    );
    expect(describeKidTime({ sun: 30, mon: 30, tue: 30, wed: 30, thu: 30, fri: 30, sat: 30 })).toBe(
      "30 min a day",
    );
  });

  it("offers the four age groups", () => {
    expect(AGE_GROUP_OPTIONS.map((o) => o.label)).toEqual([
      "Ages 4–6",
      "Ages 7–10",
      "Ages 11–13",
      "Ages 14+",
    ]);
  });
});
