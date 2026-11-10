/**
 * Default values applied when a parent doesn't specify them.
 */
import type { WeeklyCapacity } from "./assignment.js";
import type { Role } from "./status.js";

/**
 * Starting chore capacity for a new member, in minutes per day. Parents can
 * change it at any time. Kids get more time on weekends than on school days.
 */
export function defaultWeeklyCapacity(role: Role): WeeklyCapacity {
  if (role === "PARENT") {
    return { sun: 60, mon: 60, tue: 60, wed: 60, thu: 60, fri: 60, sat: 60 };
  }
  return { sun: 40, mon: 20, tue: 20, wed: 20, thu: 20, fri: 20, sat: 40 };
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
