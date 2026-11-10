import { describe, expect, it } from "vitest";
import { splitPoints } from "./points.js";

describe("splitPoints", () => {
  it("gives a solo assignee everything", () => {
    expect(splitPoints(10, ["billy"])).toEqual(new Map([["billy", 10]]));
  });

  it("splits evenly", () => {
    expect(splitPoints(10, ["sally", "billy"])).toEqual(
      new Map([
        ["billy", 5],
        ["sally", 5],
      ]),
    );
  });

  it("hands out the remainder in sorted-id order, so input order doesn't matter", () => {
    const expected = new Map([
      ["a", 3],
      ["b", 2],
      ["c", 2],
    ]);
    expect(splitPoints(7, ["c", "a", "b"])).toEqual(expected);
    expect(splitPoints(7, ["b", "c", "a"])).toEqual(expected);
  });

  it("always sums to the total", () => {
    for (let total = 0; total <= 25; total++) {
      const sum = [...splitPoints(total, ["a", "b", "c", "d"]).values()].reduce((x, y) => x + y);
      expect(sum).toBe(total);
    }
  });

  it("ignores duplicate ids", () => {
    expect(splitPoints(4, ["a", "a", "b"])).toEqual(
      new Map([
        ["a", 2],
        ["b", 2],
      ]),
    );
  });

  it("rejects invalid input", () => {
    expect(() => splitPoints(-1, ["a"])).toThrow(RangeError);
    expect(() => splitPoints(1.5, ["a"])).toThrow(RangeError);
    expect(() => splitPoints(5, [])).toThrow(RangeError);
  });
});
