import type { MemberProgress } from "@titan/contracts";
import { describe, expect, it } from "vitest";
import { levelLine, parseSeen, seenNow, whatsNew } from "./celebrate";

const progress = (overrides: Partial<MemberProgress> = {}): MemberProgress => ({
  member: { membershipId: "b", displayName: "Billy", avatarColor: "#0284C7" },
  xp: 60,
  level: 2,
  xpIntoLevel: 10,
  xpForNextLevel: 100,
  streak: { days: 0, saves: 0, best: 0 },
  badges: [],
  ...overrides,
});
const badge = (key: string, label: string) => ({
  key,
  label,
  description: "",
  icon: "star" as const,
  awardedAt: "2026-11-10T12:00:00.000Z",
});

describe("celebrate once", () => {
  it("treats everything as seen on a new device", () => {
    expect(whatsNew(progress({ badges: [badge("FIRST_CHORE", "First chore")] }), null)).toEqual({
      badges: [],
    });
  });

  it("reports new badges (oldest first) and a level-up", () => {
    const now = progress({
      level: 3,
      badges: [badge("HELPER", "Helper"), badge("FIRST_CHORE", "First chore")],
    });
    expect(whatsNew(now, { level: 2, badges: [] })).toEqual({
      level: 3,
      badges: ["First chore", "Helper"],
    });
    expect(whatsNew(now, seenNow(now))).toEqual({ badges: [] });
  });

  it("reads stored state defensively", () => {
    expect(parseSeen(null)).toBeNull();
    expect(parseSeen("not json")).toBeNull();
    expect(parseSeen('{"level":"x"}')).toBeNull();
    expect(parseSeen('{"level":2,"badges":["A",3]}')).toEqual({ level: 2, badges: ["A"] });
  });

  it("describes level and streak", () => {
    expect(levelLine(progress())).toBe("Level 2");
    expect(levelLine(progress({ streak: { days: 5, saves: 0, best: 5 } }))).toBe(
      "Level 2 · 5-day streak",
    );
  });
});
