import { describe, expect, it } from "vitest";
import { CHORE_STATUSES, isTerminalStatus } from "./status.js";

describe("chore statuses", () => {
  it("treats only VERIFIED and CANCELED as terminal", () => {
    const terminal = CHORE_STATUSES.filter(isTerminalStatus);
    expect(terminal).toEqual(["VERIFIED", "CANCELED"]);
  });
});
