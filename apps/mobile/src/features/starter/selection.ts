/**
 * Picking chores from the starter list: what's ticked to begin with, and
 * which rooms show. Pure, so it's unit-tested; the API decides what's
 * suggested (by the family's ages) and adds them.
 */
import type { StarterChoreList, StarterRoom } from "@tenara/contracts";
import type { Room } from "@tenara/domain";

/** Ticked to begin with: the API's suggestions not yet added, in the given rooms (all if none). */
export function initialSelection(list: StarterChoreList, rooms?: readonly Room[]): Set<string> {
  const ids = new Set<string>();
  for (const room of visibleRooms(list, rooms)) {
    for (const chore of room.chores) if (chore.suggested && !chore.added) ids.add(chore.id);
  }
  return ids;
}

/** The rooms to show, in the list's order (all of them when `rooms` is undefined). */
export function visibleRooms(list: StarterChoreList, rooms?: readonly Room[]): StarterRoom[] {
  if (rooms === undefined) return list.rooms;
  const keep = new Set(rooms);
  return list.rooms.filter((r) => keep.has(r.room));
}

export function toggleId(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Keeps only the ids still shown (after rooms are unticked), in list order. */
export function selectedInRooms(
  list: StarterChoreList,
  selected: ReadonlySet<string>,
  rooms?: readonly Room[],
): string[] {
  return visibleRooms(list, rooms).flatMap((r) =>
    r.chores.filter((c) => selected.has(c.id) && !c.added).map((c) => c.id),
  );
}

/** Query caches that change when chores are added. */
export const CHORE_CACHES = ["chores", "agenda", "weekLoad", "instance", "starter"] as const;

/** "Add 1 chore", "Add 12 chores". */
export function addLabel(count: number): string {
  return count === 1 ? "Add 1 chore" : `Add ${count} chores`;
}
