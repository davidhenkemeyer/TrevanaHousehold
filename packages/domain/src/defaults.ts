/**
 * Default values applied when a parent doesn't specify them.
 */
import type { WeeklyCapacity } from "./assignment.js";
import { type AgeGroup, DEFAULT_AGE_GROUP } from "./starterChores.js";
import type { Role } from "./status.js";

/** Kids' minutes per day by age group: [school day, weekend day]. */
const KID_MINUTES: Record<AgeGroup, readonly [number, number]> = {
  LITTLE: [10, 20],
  KID: [20, 40],
  TWEEN: [30, 45],
  TEEN: [30, 60],
};

/**
 * Starting chore capacity for a new member, in minutes per day. Parents can
 * change it at any time. Kids get more time on weekends than on school days,
 * and older kids more than younger ones (no age group: ages 7–10).
 */
export function defaultWeeklyCapacity(role: Role, ageGroup?: AgeGroup | null): WeeklyCapacity {
  if (role === "PARENT") {
    return { sun: 60, mon: 60, tue: 60, wed: 60, thu: 60, fri: 60, sat: 60 };
  }
  const [school, weekend] = KID_MINUTES[ageGroup ?? DEFAULT_AGE_GROUP];
  return {
    sun: weekend,
    mon: school,
    tue: school,
    wed: school,
    thu: school,
    fri: school,
    sat: weekend,
  };
}

/** Avatar colors handed out in order to new members who don't pick one. */
export const AVATAR_COLORS = [
  "#2563EB",
  "#DB2777",
  "#16A34A",
  "#EA580C",
  "#7C3AED",
  "#0891B2",
  "#CA8A04",
  "#DC2626",
] as const;

export function defaultAvatarColor(existingMemberCount: number): string {
  return AVATAR_COLORS[existingMemberCount % AVATAR_COLORS.length] as string;
}
