import type { StarterChoreList, StarterChoreView } from "@tenara/contracts";
import { describe, expect, it } from "vitest";
import { addLabel, initialSelection, selectedInRooms, toggleId, visibleRooms } from "./selection";

function chore(id: string, extra: Partial<StarterChoreView> = {}): StarterChoreView {
  return {
    id,
    name: id,
    room: "KITCHEN",
    effortMinutes: 5,
    howOften: "Every day",
    timeOfDay: null,
    cue: null,
    checklist: [],
    minAge: "LITTLE",
    minAgeLabel: "Ages 4+",
    suggested: false,
    added: false,
    ...extra,
  };
}

const list: StarterChoreList = {
  rooms: [
    {
      room: "KITCHEN",
      label: "Kitchen",
      chores: [
        chore("dishes", { suggested: true }),
        chore("oven"),
        chore("trash", { suggested: true, added: true }),
      ],
    },
    { room: "PETS", label: "Pets", chores: [chore("feed", { room: "PETS", suggested: true })] },
  ],
};

describe("starter selection", () => {
  it("ticks suggestions that aren't added yet, in the chosen rooms", () => {
    expect([...initialSelection(list)]).toEqual(["dishes", "feed"]);
    expect([...initialSelection(list, ["PETS"])]).toEqual(["feed"]);
  });

  it("shows only the chosen rooms", () => {
    expect(visibleRooms(list, ["PETS"]).map((r) => r.room)).toEqual(["PETS"]);
    expect(visibleRooms(list).length).toBe(2);
  });

  it("toggles and drops ids from rooms no longer shown", () => {
    const picked = toggleId(toggleId(initialSelection(list), "oven"), "dishes");
    expect([...picked].sort()).toEqual(["feed", "oven"]);
    expect(selectedInRooms(list, picked, ["KITCHEN"])).toEqual(["oven"]);
    // Already added chores are never sent again.
    expect(selectedInRooms(list, new Set(["trash", "dishes"]))).toEqual(["dishes"]);
  });

  it("labels the button", () => {
    expect(addLabel(1)).toBe("Add 1 chore");
    expect(addLabel(12)).toBe("Add 12 chores");
  });
});
