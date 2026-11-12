/**
 * First-time setup, as steps: family → kids → rooms → rewards → done.
 *
 * The family is created on the first step, so there's no going back to it
 * (its name and time zone can be changed later on the Family tab). Every step
 * after it can be skipped, which leaves things as they are (no kids, no
 * chores, no rewards); everything can be set up later from the tabs.
 */
import type { Member } from "@tenara/contracts";
import { AGE_GROUP_LABELS, type AgeGroup, type Room } from "@tenara/domain";

export const SETUP_STEPS = ["family", "kids", "rooms", "rewards", "done"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

export function nextStep(step: SetupStep): SetupStep {
  const i = SETUP_STEPS.indexOf(step);
  return SETUP_STEPS[Math.min(i + 1, SETUP_STEPS.length - 1)] as SetupStep;
}

/** Undefined when there's no going back (the first two steps and the end). */
export function previousStep(step: SetupStep): SetupStep | undefined {
  if (step === "family" || step === "kids" || step === "done") return undefined;
  return SETUP_STEPS[SETUP_STEPS.indexOf(step) - 1];
}

export function canSkip(step: SetupStep): boolean {
  return step === "kids" || step === "rooms" || step === "rewards";
}

/** "Step 2 of 4" (the finish screen isn't counted). */
export function stepLabel(step: SetupStep): string | undefined {
  if (step === "done") return undefined;
  return `Step ${SETUP_STEPS.indexOf(step) + 1} of ${SETUP_STEPS.length - 1}`;
}

/** Rooms ticked to begin with: the ones nearly every family has. */
export const DEFAULT_ROOMS: readonly Room[] = ["EVERYDAY", "KITCHEN", "BEDROOM", "LIVING_ROOM"];

export function toggleRoom(rooms: readonly Room[], room: Room, order: readonly Room[]): Room[] {
  const next = new Set(rooms);
  if (next.has(room)) next.delete(room);
  else next.add(room);
  return order.filter((r) => next.has(r));
}

export const AGE_GROUP_OPTIONS = (Object.keys(AGE_GROUP_LABELS) as AgeGroup[]).map((value) => ({
  value,
  label: AGE_GROUP_LABELS[value],
}));

/** "10 min on school days, 20 on weekends" from a kid's capacity. */
export function describeKidTime(capacity: Member["capacity"]): string {
  const school = capacity.mon;
  const weekend = capacity.sat;
  if (school === weekend) return `${school} min a day`;
  return `${school} min on school days, ${weekend} on weekends`;
}
