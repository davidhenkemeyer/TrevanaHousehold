/**
 * Showing a family's plan: the one-line status, the list of what Pro adds,
 * and spotting "this needs Pro" errors. The API decides what a family can do;
 * this only words it.
 */
import type { Plan } from "@tenara/contracts";
import { ApiError } from "../../api/http";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Whole days from now until `iso`, at least 1 while it's still ahead. */
export function daysLeft(iso: string, now: Date): number {
  const ms = new Date(iso).getTime() - now.getTime();
  return Math.max(ms > 0 ? 1 : 0, Math.ceil(ms / 86_400_000));
}

/** "Pro trial · 9 days left", "Pro · renews Dec 11", "Pro · ends Dec 11", "Basic (free)". */
export function planHeadline(plan: Plan, now: Date): string {
  if (plan.tier === "BASIC") return "Basic (free)";
  if (plan.reason === "TRIAL" && plan.endsAt) {
    const left = daysLeft(plan.endsAt, now);
    return `Pro trial · ${left} ${left === 1 ? "day" : "days"} left`;
  }
  if (plan.endsAt === null || new Date(plan.endsAt).getUTCFullYear() >= 9999) return "Pro";
  return plan.willRenew ? `Pro · renews ${day(plan.endsAt)}` : `Pro · ends ${day(plan.endsAt)}`;
}

/** What Pro adds, in the order the Pro screen lists it. */
export const PRO_PERKS: readonly { title: string; detail: string }[] = [
  { title: "Room for everyone", detail: "More than 2 parents and 3 kids." },
  {
    title: "Photo proof",
    detail: "Kids snap a photo when they're done, with reference photos and pins.",
  },
  {
    title: "Real-money allowance",
    detail: "Track what each kid has earned and what you've paid out.",
  },
  {
    title: "Rewards catalog and job board",
    detail: "Kids trade points for rewards and claim paid extra jobs.",
  },
  { title: "Family goal", detail: "Everyone's XP fills one bar toward a family treat." },
  { title: "Home-screen widgets", detail: "Today's chores at a glance, without opening the app." },
  { title: "Full history", detail: "Basic keeps the last 30 days." },
];

/** Basic's list, for the comparison. */
export const BASIC_INCLUDES: readonly string[] = [
  "Up to 2 parents and 3 kids",
  "Automatic scheduling by age and time",
  "The starter chore list",
  "Review, points, XP, levels, badges, and streaks",
  "The daily digest and the web app",
];

/** True for the API's "that's a Pro feature" answer. */
export function isProRequired(error: unknown): boolean {
  return error instanceof ApiError && error.code === "PRO_REQUIRED";
}

/** "$34.99 a year (about $2.92 a month)" from the store's prices. */
export function yearlyLabel(yearly: string, perMonth: string | null): string {
  return perMonth ? `${yearly} a year (about ${perMonth} a month)` : `${yearly} a year`;
}
