/**
 * Progress: XP, levels, streaks, badges, and the shared family goal.
 * Everyone can see the family goal; kids see only their own progress
 * (there's no leaderboard).
 */
import { MAX_GOAL_XP } from "@titan/domain";
import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.js";
import { personSchema } from "./instances.js";

export const badgeIconSchema = z.enum([
  "star",
  "trophy",
  "flame",
  "calendar",
  "target",
  "medal",
  "hand",
]);

/** A badge that can be earned (shown greyed until it is). */
export const badgeDefinitionSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  icon: badgeIconSchema,
});
export type BadgeDefinition = z.infer<typeof badgeDefinitionSchema>;

export const earnedBadgeSchema = badgeDefinitionSchema.extend({ awardedAt: isoDateTimeSchema });
export type EarnedBadge = z.infer<typeof earnedBadgeSchema>;

export const memberProgressSchema = z.object({
  member: personSchema,
  xp: z.int(),
  level: z.int(),
  /** XP since reaching this level, and XP between this level and the next. */
  xpIntoLevel: z.int(),
  xpForNextLevel: z.int(),
  streak: z.object({
    /** Days in a row with everything handed in on time. */
    days: z.int(),
    /** Saves held: each covers one missed day. */
    saves: z.int(),
    best: z.int(),
  }),
  /** Newest first. */
  badges: z.array(earnedBadgeSchema),
});
export type MemberProgress = z.infer<typeof memberProgressSchema>;

export const familyGoalSchema = z.object({
  id: idSchema,
  name: z.string(),
  targetXp: z.int(),
  /** Everyone's XP since the goal started. */
  progressXp: z.int(),
  percent: z.int(),
  reachedAt: isoDateTimeSchema.nullable(),
  startedAt: isoDateTimeSchema,
});
export type FamilyGoal = z.infer<typeof familyGoalSchema>;

export const progressSchema = z.object({
  /** Whether the family shows XP and badges. Progress is kept either way. */
  gamification: z.boolean(),
  members: z.array(memberProgressSchema),
  goal: familyGoalSchema.nullable(),
  /** Every badge there is, in display order, for the badge grid. */
  allBadges: z.array(badgeDefinitionSchema),
});
export type Progress = z.infer<typeof progressSchema>;

export const createGoalBodySchema = z.strictObject({
  name: z.string().trim().min(1).max(60),
  targetXp: z.int().min(10).max(MAX_GOAL_XP),
});
export type CreateGoalBody = z.infer<typeof createGoalBodySchema>;
