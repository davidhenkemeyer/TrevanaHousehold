import { AGE_GROUPS, ROOMS } from "@tenara/domain";
import { z } from "zod";
import { choreSchema } from "./chores.js";

/** A ready-made chore from the starter list, as offered to one family. */
export const starterChoreSchema = z.object({
  /** Stable template id, e.g. "load-dishwasher". */
  id: z.string(),
  name: z.string(),
  room: z.enum(ROOMS),
  effortMinutes: z.int(),
  /** "Every day", "Every week on Tue, Fri", ... */
  howOften: z.string(),
  timeOfDay: z.string().nullable(),
  cue: z.string().nullable(),
  checklist: z.array(z.string()),
  /** The youngest who can do it, or ADULT for parents only. */
  minAge: z.enum([...AGE_GROUPS, "ADULT"]),
  /** "Ages 7+", "Parents". */
  minAgeLabel: z.string(),
  /** Worth ticking by default for this family (someone besides the parents can do it). */
  suggested: z.boolean(),
  /** Already added to this family (archived chores don't count). */
  added: z.boolean(),
});
export type StarterChoreView = z.infer<typeof starterChoreSchema>;

export const starterRoomSchema = z.object({
  room: z.enum(ROOMS),
  label: z.string(),
  chores: z.array(starterChoreSchema),
});
export type StarterRoom = z.infer<typeof starterRoomSchema>;

export const starterChoreListSchema = z.object({ rooms: z.array(starterRoomSchema) });
export type StarterChoreList = z.infer<typeof starterChoreListSchema>;

export const addStarterChoresBodySchema = z.strictObject({
  templateIds: z
    .array(z.string().min(1).max(60))
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, "Chores must not repeat"),
});
export type AddStarterChoresBody = z.infer<typeof addStarterChoresBodySchema>;

export const addStarterChoresResultSchema = z.object({
  /** The chores created, in the order asked for. */
  chores: z.array(choreSchema),
  /** Template ids skipped because the family already has them. */
  skipped: z.array(z.string()),
});
export type AddStarterChoresResult = z.infer<typeof addStarterChoresResultSchema>;
