import { describe, expect, it, vi } from "vitest";
import { nextPinNumber, pinsOf, pressPosition, tapToPercent, toAnnotations } from "./pins";

// upload.ts imports native Expo modules; stub them so the pure helpers can be tested.
vi.mock("expo-image-manipulator", () => ({ ImageManipulator: {}, SaveFormat: { JPEG: "jpeg" } }));
vi.mock("expo-image-picker", () => ({}));
vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
const { resizeTarget, uploadFormData } = await import("./upload");

describe("photo upload helpers", () => {
  it("shrinks only photos larger than 1600 px, along the longest side", () => {
    expect(resizeTarget(4032, 3024)).toEqual({ width: 1600 });
    expect(resizeTarget(3024, 4032)).toEqual({ height: 1600 });
    expect(resizeTarget(1200, 900)).toBeNull();
    expect(resizeTarget(0, 0)).toBeNull();
  });

  it("puts the signed fields first and the file last", () => {
    const file = new Blob(["x"], { type: "image/jpeg" });
    const form = uploadFormData({ key: "families/f/submission/1.jpg", policy: "p" }, file);
    expect([...form.keys()]).toEqual(["key", "policy", "file"]);
  });
});

describe("pins", () => {
  it("turns a tap into a clamped percent position", () => {
    expect(tapToPercent(100, 50, 400, 200)).toEqual({ xPercent: 25, yPercent: 25 });
    expect(tapToPercent(-5, 999, 400, 200)).toEqual({ xPercent: 0, yPercent: 100 });
    expect(tapToPercent(1, 1, 3, 3)).toEqual({ xPercent: 33.3, yPercent: 33.3 });
    // Unknown positions or sizes place no pin (rather than sending NaN).
    expect(tapToPercent(10, 10, 0, 0)).toBeNull();
    expect(tapToPercent(undefined, 10, 400, 200)).toBeNull();
    expect(tapToPercent(Number.NaN, 10, 400, 200)).toBeNull();
  });

  it("reads where a press landed on phones and on the web", () => {
    expect(pressPosition({ locationX: 5, locationY: 6 })).toEqual({ x: 5, y: 6 });
    expect(pressPosition({ offsetX: 7, offsetY: 8 })).toEqual({ x: 7, y: 8 });
    expect(pressPosition({})).toEqual({});
  });

  it("numbers pins with the lowest free number", () => {
    const pin = (n: number) => ({ pin: n, xPercent: 0, yPercent: 0, comment: "x" });
    expect(nextPinNumber([])).toBe(1);
    expect(nextPinNumber([pin(1), pin(3)])).toBe(2);
    expect(nextPinNumber([pin(1), pin(2)])).toBe(3);
  });

  it("sends only pins with comments, in order", () => {
    expect(
      toAnnotations([
        { pin: 2, xPercent: 1, yPercent: 1, comment: " Socks " },
        { pin: 1, xPercent: 2, yPercent: 2, comment: "  " },
        { pin: 3, xPercent: 3, yPercent: 3, comment: "Bed" },
      ]),
    ).toEqual({
      pins: [
        { pin: 2, xPercent: 1, yPercent: 1, comment: "Socks" },
        { pin: 3, xPercent: 3, yPercent: 3, comment: "Bed" },
      ],
    });
    expect(toAnnotations([])).toBeUndefined();
  });

  it("reads annotations from the API, ignoring anything malformed", () => {
    const pins = [{ pin: 1, xPercent: 10, yPercent: 20, comment: "Here" }];
    expect(pinsOf({ pins })).toEqual(pins);
    expect(pinsOf(null)).toEqual([]);
    expect(pinsOf({ pins: "nope" })).toEqual([]);
  });
});
