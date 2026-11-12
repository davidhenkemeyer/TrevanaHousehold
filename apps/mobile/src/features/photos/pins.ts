/**
 * Photo mark-up: numbered pins with short comments, placed by tapping the
 * photo. Positions are percentages of the photo's width and height, so pins
 * land in the same spot on any screen size.
 */
import { type Annotations, annotationsSchema } from "@tenara/contracts";

export type Pin = Annotations["pins"][number];

export const MAX_PINS = 20;
export const MAX_PIN_COMMENT = 60;

/**
 * A tap at (x, y) inside a width × height photo, as a percent position (one
 * decimal). Null when the position is unknown (not a number, or no size yet).
 */
export function tapToPercent(
  x: number | undefined,
  y: number | undefined,
  width: number,
  height: number,
): { xPercent: number; yPercent: number } | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || width <= 0 || height <= 0) return null;
  const pct = (v: number, size: number) =>
    Math.round(Math.min(Math.max(v / size, 0), 1) * 1000) / 10;
  return { xPercent: pct(x!, width), yPercent: pct(y!, height) };
}

/**
 * Where a press landed, relative to the pressed element. Phones report
 * `locationX/Y`; on the web, a press is a mouse or touch click, which reports
 * `offsetX/Y` instead.
 */
export function pressPosition(nativeEvent: object): { x?: number; y?: number } {
  const e = nativeEvent as {
    locationX?: number;
    locationY?: number;
    offsetX?: number;
    offsetY?: number;
  };
  const pick = (a?: number, b?: number) => (Number.isFinite(a) ? a : b);
  const x = pick(e.locationX, e.offsetX);
  const y = pick(e.locationY, e.offsetY);
  return { ...(x !== undefined && { x }), ...(y !== undefined && { y }) };
}

/** The lowest pin number not in use (numbers stay stable when one is removed). */
export function nextPinNumber(pins: readonly Pin[]): number {
  const used = new Set(pins.map((p) => p.pin));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

/** Pins worth sending: the ones with a comment, sorted by number. Undefined if none. */
export function toAnnotations(pins: readonly Pin[]): Annotations | undefined {
  const kept = pins
    .map((p) => ({ ...p, comment: p.comment.trim() }))
    .filter((p) => p.comment !== "")
    .sort((a, b) => a.pin - b.pin);
  return kept.length > 0 ? { pins: kept } : undefined;
}

/** Reads a review's annotations from the API (typed as unknown there). */
export function pinsOf(annotations: unknown): Pin[] {
  const parsed = annotationsSchema.safeParse(annotations);
  return parsed.success ? parsed.data.pins : [];
}
