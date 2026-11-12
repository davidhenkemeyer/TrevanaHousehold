/**
 * The starter chore list: ready-made chores, grouped by room, that a family
 * can add in one go during setup (or later, from the Chores tab).
 *
 * Each template knows how long it takes, how often it comes up, and the
 * youngest age group that can do it. Adding one creates an ordinary AUTO
 * chore: the scheduler then spreads it across the members old enough for it,
 * by capacity. Templates are plain data; ids are stable slugs, stored on the
 * chore (`templateId`) so the same template isn't added twice.
 */
import type { PlainDate } from "./calendar.js";
import type { RecurrenceRule } from "./recurrence.js";
import type { Role } from "./status.js";
import { parsePlainTime } from "./timezone.js";

/** Kids' age groups. Parents count as adults. */
export const AGE_GROUPS = ["LITTLE", "KID", "TWEEN", "TEEN"] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

/** For display: "Ages 4–6" etc. */
export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  LITTLE: "Ages 4–6",
  KID: "Ages 7–10",
  TWEEN: "Ages 11–13",
  TEEN: "Ages 14+",
};

/** The youngest who can do a chore: an age group, or ADULT for parents only. */
export type MinAge = AgeGroup | "ADULT";

const AGE_RANK: Record<MinAge, number> = { LITTLE: 0, KID: 1, TWEEN: 2, TEEN: 3, ADULT: 4 };

/** A kid with no age group set is treated as 7–10. */
export const DEFAULT_AGE_GROUP: AgeGroup = "KID";

export const ROOMS = [
  "EVERYDAY",
  "KITCHEN",
  "BATHROOM",
  "BEDROOM",
  "LIVING_ROOM",
  "LAUNDRY",
  "OUTDOOR",
  "PETS",
] as const;
export type Room = (typeof ROOMS)[number];

export const ROOM_LABELS: Record<Room, string> = {
  EVERYDAY: "Everyday",
  KITCHEN: "Kitchen",
  BATHROOM: "Bathroom",
  BEDROOM: "Bedrooms",
  LIVING_ROOM: "Living room",
  LAUNDRY: "Laundry",
  OUTDOOR: "Outdoors",
  PETS: "Pets",
};

/** How often a template comes up. Weekdays are 0 (Sun) – 6 (Sat). */
export type Cadence =
  | { every: "DAY" }
  | { every: "WEEK"; weekdays: readonly number[] }
  | { every: "TWO_WEEKS"; weekday: number }
  | { every: "MONTH"; day: number }
  | { every: "QUARTER"; day: number };

export interface StarterChore {
  id: string;
  name: string;
  room: Room;
  effortMinutes: number;
  cadence: Cadence;
  /** When it becomes available, "HH:MM". Default midnight. */
  timeOfDay?: string;
  /** Situational trigger shown on the card. */
  cue?: string;
  checklist?: readonly string[];
  minAge: MinAge;
  /** Ticked by default when the family picks this room. */
  suggested?: boolean;
}

const SAT = 6;
const SUN = 0;

/* prettier-ignore */
export const STARTER_CHORES: readonly StarterChore[] = [
  // Everyday
  { id: "make-bed", name: "Make your bed", room: "EVERYDAY", effortMinutes: 5, cadence: { every: "DAY" }, timeOfDay: "07:00", cue: "After you get up", minAge: "LITTLE", suggested: true },
  { id: "set-table", name: "Set the table", room: "EVERYDAY", effortMinutes: 5, cadence: { every: "DAY" }, timeOfDay: "17:00", cue: "Before dinner", minAge: "LITTLE", suggested: true },
  { id: "clear-table", name: "Clear the table", room: "EVERYDAY", effortMinutes: 5, cadence: { every: "DAY" }, timeOfDay: "18:00", cue: "After dinner", minAge: "LITTLE", suggested: true },
  { id: "pick-up-toys", name: "Pick up toys", room: "EVERYDAY", effortMinutes: 10, cadence: { every: "DAY" }, timeOfDay: "18:30", cue: "Before bath time", minAge: "LITTLE" },
  { id: "ten-minute-tidy", name: "10-minute tidy", room: "EVERYDAY", effortMinutes: 10, cadence: { every: "DAY" }, timeOfDay: "18:30", cue: "After dinner", minAge: "KID" },
  { id: "get-mail", name: "Bring in the mail", room: "EVERYDAY", effortMinutes: 5, cadence: { every: "DAY" }, timeOfDay: "15:00", minAge: "LITTLE" },
  { id: "pack-backpack", name: "Pack your backpack", room: "EVERYDAY", effortMinutes: 5, cadence: { every: "WEEK", weekdays: [0, 1, 2, 3, 4] }, timeOfDay: "19:00", cue: "Before bed", minAge: "KID" },

  // Kitchen
  { id: "load-dishwasher", name: "Load the dishwasher", room: "KITCHEN", effortMinutes: 10, cadence: { every: "DAY" }, timeOfDay: "18:30", cue: "After dinner", minAge: "KID", suggested: true },
  { id: "unload-dishwasher", name: "Unload the dishwasher", room: "KITCHEN", effortMinutes: 10, cadence: { every: "DAY" }, timeOfDay: "15:00", cue: "After school", minAge: "KID", suggested: true },
  { id: "wipe-counters", name: "Wipe the counters", room: "KITCHEN", effortMinutes: 5, cadence: { every: "DAY" }, timeOfDay: "18:30", cue: "After dinner", minAge: "KID" },
  { id: "hand-wash-dishes", name: "Wash dishes by hand", room: "KITCHEN", effortMinutes: 15, cadence: { every: "DAY" }, timeOfDay: "18:30", cue: "After dinner", minAge: "TWEEN" },
  { id: "take-out-trash", name: "Take out the trash", room: "KITCHEN", effortMinutes: 5, cadence: { every: "WEEK", weekdays: [2, 5] }, timeOfDay: "17:00", minAge: "KID", suggested: true },
  { id: "take-out-recycling", name: "Take out the recycling", room: "KITCHEN", effortMinutes: 5, cadence: { every: "WEEK", weekdays: [4] }, timeOfDay: "17:00", minAge: "KID" },
  { id: "sweep-kitchen", name: "Sweep the kitchen floor", room: "KITCHEN", effortMinutes: 10, cadence: { every: "WEEK", weekdays: [3] }, minAge: "KID", suggested: true },
  { id: "mop-kitchen", name: "Mop the kitchen floor", room: "KITCHEN", effortMinutes: 20, cadence: { every: "WEEK", weekdays: [SAT] }, minAge: "TWEEN" },
  { id: "clean-microwave", name: "Clean the microwave", room: "KITCHEN", effortMinutes: 10, cadence: { every: "WEEK", weekdays: [SUN] }, minAge: "KID" },
  { id: "put-away-groceries", name: "Put away groceries", room: "KITCHEN", effortMinutes: 10, cadence: { every: "WEEK", weekdays: [SAT] }, minAge: "LITTLE" },
  { id: "help-cook-dinner", name: "Help cook dinner", room: "KITCHEN", effortMinutes: 30, cadence: { every: "WEEK", weekdays: [SUN] }, timeOfDay: "16:30", minAge: "TWEEN" },
  { id: "clean-fridge", name: "Clean out the fridge", room: "KITCHEN", effortMinutes: 30, cadence: { every: "MONTH", day: 1 }, checklist: ["Throw out old food", "Wipe the shelves", "Wipe the door"], minAge: "TWEEN" },
  { id: "clean-oven", name: "Clean the oven", room: "KITCHEN", effortMinutes: 45, cadence: { every: "QUARTER", day: 15 }, minAge: "ADULT" },

  // Bathroom
  { id: "wipe-bathroom-sink", name: "Wipe the bathroom sink", room: "BATHROOM", effortMinutes: 5, cadence: { every: "WEEK", weekdays: [3] }, minAge: "KID", suggested: true },
  { id: "clean-mirror", name: "Clean the bathroom mirror", room: "BATHROOM", effortMinutes: 5, cadence: { every: "WEEK", weekdays: [SAT] }, minAge: "KID" },
  { id: "clean-toilet", name: "Clean the toilet", room: "BATHROOM", effortMinutes: 10, cadence: { every: "WEEK", weekdays: [SAT] }, checklist: ["Bowl", "Seat and lid", "Outside and base"], minAge: "TWEEN", suggested: true },
  { id: "clean-tub", name: "Clean the tub or shower", room: "BATHROOM", effortMinutes: 20, cadence: { every: "WEEK", weekdays: [SAT] }, minAge: "TWEEN" },
  { id: "mop-bathroom", name: "Mop the bathroom floor", room: "BATHROOM", effortMinutes: 15, cadence: { every: "TWO_WEEKS", weekday: SAT }, minAge: "TWEEN" },
  { id: "change-towels", name: "Hang fresh towels", room: "BATHROOM", effortMinutes: 5, cadence: { every: "WEEK", weekdays: [SUN] }, minAge: "KID" },
  { id: "restock-toilet-paper", name: "Restock toilet paper", room: "BATHROOM", effortMinutes: 5, cadence: { every: "WEEK", weekdays: [SUN] }, minAge: "LITTLE" },

  // Bedrooms
  { id: "tidy-bedroom", name: "Tidy your room", room: "BEDROOM", effortMinutes: 10, cadence: { every: "DAY" }, timeOfDay: "19:00", cue: "Before bed", minAge: "LITTLE", suggested: true },
  { id: "put-clothes-away", name: "Put dirty clothes in the hamper", room: "BEDROOM", effortMinutes: 5, cadence: { every: "DAY" }, timeOfDay: "19:00", cue: "When you change for bed", minAge: "LITTLE" },
  { id: "dust-bedroom", name: "Dust your room", room: "BEDROOM", effortMinutes: 10, cadence: { every: "WEEK", weekdays: [SAT] }, minAge: "KID" },
  { id: "vacuum-bedroom", name: "Vacuum your room", room: "BEDROOM", effortMinutes: 10, cadence: { every: "WEEK", weekdays: [SAT] }, minAge: "KID", suggested: true },
  { id: "change-sheets", name: "Change the sheets", room: "BEDROOM", effortMinutes: 15, cadence: { every: "TWO_WEEKS", weekday: SUN }, minAge: "TWEEN", suggested: true },
  { id: "clear-under-bed", name: "Clear out under the bed", room: "BEDROOM", effortMinutes: 10, cadence: { every: "MONTH", day: 1 }, minAge: "KID" },

  // Living room
  { id: "tidy-living-room", name: "Tidy the living room", room: "LIVING_ROOM", effortMinutes: 10, cadence: { every: "DAY" }, timeOfDay: "18:30", cue: "After dinner", minAge: "LITTLE", suggested: true },
  { id: "vacuum-living-room", name: "Vacuum the living room", room: "LIVING_ROOM", effortMinutes: 15, cadence: { every: "WEEK", weekdays: [SAT] }, minAge: "KID", suggested: true },
  { id: "dust-living-room", name: "Dust the living room", room: "LIVING_ROOM", effortMinutes: 10, cadence: { every: "WEEK", weekdays: [SAT] }, minAge: "KID" },
  { id: "fold-blankets", name: "Fold blankets and fluff pillows", room: "LIVING_ROOM", effortMinutes: 5, cadence: { every: "DAY" }, timeOfDay: "19:30", cue: "Before bed", minAge: "LITTLE" },
  { id: "clean-windows", name: "Clean the windows", room: "LIVING_ROOM", effortMinutes: 20, cadence: { every: "MONTH", day: 15 }, minAge: "TWEEN" },

  // Laundry
  { id: "sort-laundry", name: "Sort the laundry", room: "LAUNDRY", effortMinutes: 10, cadence: { every: "WEEK", weekdays: [1, 4] }, minAge: "LITTLE" },
  { id: "start-laundry", name: "Start a load of laundry", room: "LAUNDRY", effortMinutes: 10, cadence: { every: "WEEK", weekdays: [1, 4] }, minAge: "TWEEN" },
  { id: "fold-laundry", name: "Fold the laundry", room: "LAUNDRY", effortMinutes: 15, cadence: { every: "WEEK", weekdays: [1, 4] }, timeOfDay: "16:00", minAge: "KID", suggested: true },
  { id: "put-away-laundry", name: "Put away your laundry", room: "LAUNDRY", effortMinutes: 10, cadence: { every: "WEEK", weekdays: [1, 4] }, timeOfDay: "17:00", minAge: "LITTLE", suggested: true },

  // Outdoors
  { id: "water-plants", name: "Water the plants", room: "OUTDOOR", effortMinutes: 10, cadence: { every: "WEEK", weekdays: [3, SAT] }, minAge: "KID", suggested: true },
  { id: "pick-up-yard", name: "Pick up the yard", room: "OUTDOOR", effortMinutes: 10, cadence: { every: "WEEK", weekdays: [SAT] }, minAge: "LITTLE" },
  { id: "sweep-porch", name: "Sweep the porch", room: "OUTDOOR", effortMinutes: 10, cadence: { every: "WEEK", weekdays: [SUN] }, minAge: "KID" },
  { id: "pull-weeds", name: "Pull weeds", room: "OUTDOOR", effortMinutes: 20, cadence: { every: "WEEK", weekdays: [SAT] }, minAge: "TWEEN" },
  { id: "mow-lawn", name: "Mow the lawn", room: "OUTDOOR", effortMinutes: 45, cadence: { every: "WEEK", weekdays: [SAT] }, minAge: "TEEN" },
  { id: "wash-car", name: "Wash the car", room: "OUTDOOR", effortMinutes: 45, cadence: { every: "MONTH", day: 1 }, minAge: "TWEEN" },
  { id: "rake-leaves", name: "Rake the leaves", room: "OUTDOOR", effortMinutes: 60, cadence: { every: "QUARTER", day: 1 }, minAge: "TWEEN" },

  // Pets
  { id: "feed-pet-morning", name: "Feed the pet (morning)", room: "PETS", effortMinutes: 5, cadence: { every: "DAY" }, timeOfDay: "07:00", minAge: "LITTLE", suggested: true },
  { id: "feed-pet-evening", name: "Feed the pet (evening)", room: "PETS", effortMinutes: 5, cadence: { every: "DAY" }, timeOfDay: "17:00", minAge: "LITTLE", suggested: true },
  { id: "fresh-water", name: "Give the pet fresh water", room: "PETS", effortMinutes: 5, cadence: { every: "DAY" }, timeOfDay: "07:00", minAge: "LITTLE" },
  { id: "walk-dog", name: "Walk the dog", room: "PETS", effortMinutes: 20, cadence: { every: "DAY" }, timeOfDay: "16:00", cue: "After school", minAge: "TWEEN", suggested: true },
  { id: "scoop-litter", name: "Scoop the litter box", room: "PETS", effortMinutes: 5, cadence: { every: "DAY" }, timeOfDay: "16:00", minAge: "KID" },
  { id: "clean-cage", name: "Clean the cage or tank", room: "PETS", effortMinutes: 20, cadence: { every: "WEEK", weekdays: [SAT] }, minAge: "TWEEN" },
  { id: "brush-pet", name: "Brush the pet", room: "PETS", effortMinutes: 10, cadence: { every: "WEEK", weekdays: [SUN] }, minAge: "KID" },
];

const BY_ID = new Map(STARTER_CHORES.map((t) => [t.id, t]));

export function findStarterChore(id: string): StarterChore | undefined {
  return BY_ID.get(id);
}

/** The template's schedule as a real rule, starting on the family's `today`. */
export function starterRecurrence(template: StarterChore, today: PlainDate): RecurrenceRule {
  const rule: RecurrenceRule = (() => {
    const c = template.cadence;
    switch (c.every) {
      case "DAY":
        return { freq: "DAILY", startDate: today };
      case "WEEK":
        return { freq: "WEEKLY", startDate: today, byWeekday: [...c.weekdays] };
      case "TWO_WEEKS":
        return { freq: "WEEKLY", interval: 2, startDate: today, byWeekday: [c.weekday] };
      case "MONTH":
        return { freq: "MONTHLY", startDate: today, byMonthDay: c.day };
      case "QUARTER":
        return { freq: "QUARTERLY", startDate: today, byMonthDay: c.day };
    }
  })();
  if (template.timeOfDay !== undefined) rule.timeOfDay = template.timeOfDay;
  return rule;
}

const MINUTES_PER_DAY = 24 * 60;

/**
 * How long after it becomes available a template's chore is due: the end of
 * that day for daily chores; for less frequent ones, a window that leaves room
 * to fit them in (2 days for weekly, a week for monthly, two for quarterly).
 */
export function starterDeadlineMinutes(template: StarterChore): number {
  const { hour, minute } = parsePlainTime(template.timeOfDay ?? "00:00");
  const endOfDay = MINUTES_PER_DAY - (hour * 60 + minute);
  switch (template.cadence.every) {
    case "DAY":
      return endOfDay;
    case "WEEK":
    case "TWO_WEEKS":
      // Twice-a-week chores get to the end of the day, so they don't overlap.
      return template.cadence.every === "WEEK" && template.cadence.weekdays.length > 1
        ? endOfDay
        : endOfDay + MINUTES_PER_DAY;
    case "MONTH":
      return endOfDay + 6 * MINUTES_PER_DAY;
    case "QUARTER":
      return endOfDay + 13 * MINUTES_PER_DAY;
  }
}

export interface AgeMember {
  id: string;
  role: Role;
  /** Kids only; null means not set (treated as DEFAULT_AGE_GROUP). */
  ageGroup: AgeGroup | null;
}

/** Whether a member is old enough for a template. Parents always are. */
export function oldEnoughFor(template: StarterChore, member: AgeMember): boolean {
  if (member.role === "PARENT") return true;
  return AGE_RANK[member.ageGroup ?? DEFAULT_AGE_GROUP] >= AGE_RANK[template.minAge];
}

/**
 * The chore's candidate pool: every member old enough for it. Returns an empty
 * list ("anyone") when everyone qualifies, so new members join it automatically.
 */
export function starterEligible(template: StarterChore, members: readonly AgeMember[]): string[] {
  const ok = members.filter((m) => oldEnoughFor(template, m));
  return ok.length === members.length ? [] : ok.map((m) => m.id);
}

/**
 * Whether anyone in the family besides the parents can do it: used to tick
 * kid-friendly suggestions in setup. A parents-only chore is never suggested.
 */
export function suitsFamily(template: StarterChore, members: readonly AgeMember[]): boolean {
  return members.some((m) => m.role === "CHILD" && oldEnoughFor(template, m));
}

/** The templates ticked by default for these rooms and members. */
export function suggestedStarterIds(
  rooms: readonly Room[],
  members: readonly AgeMember[],
): string[] {
  const picked = new Set(rooms);
  return STARTER_CHORES.filter(
    (t) => t.suggested === true && picked.has(t.room) && suitsFamily(t, members),
  ).map((t) => t.id);
}
