/**
 * The chore editor's form state and how it maps to the API.
 *
 * The form keeps every field the editor shows (e.g. weekdays stay remembered
 * while the parent tries "Monthly"), and `toChoreBody` sends only what the
 * chosen frequency uses. Validation runs the API's own Zod schema, so the
 * editor and the server never disagree about what's allowed; the server's
 * answer still wins if they somehow do.
 */
import {
  type Chore,
  type CreateChoreBody,
  type Member,
  type UpdateChoreBody,
  createChoreBodySchema,
} from "@titan/contracts";
import {
  type AssignMode,
  type ChoreKind,
  type Frequency,
  type PlainDate,
  type Priority,
  type ReviewPolicy,
  DEFAULT_TIME_OF_DAY,
  toParts,
  weekdayOf,
} from "@titan/domain";

const MINUTES_PER_DAY = 24 * 60;

/** What to do with the chore's reference photo when saving. */
export type ReferencePhotoChange =
  { kind: "unchanged" } | { kind: "new"; uploadId: string } | { kind: "remove" };

/** "Due by the end of the day it starts" is stored as minutes, but edited as its own choice. */
export type Deadline = { kind: "endOfDay" } | { kind: "minutes"; minutes: number };

export interface ChoreForm {
  /** Routine (baseline duty) or extra job (optional, earns coins). */
  kind: ChoreKind;
  /** Custom XP for approving it; null = from effort. */
  xpOverride: number | null;
  name: string;
  description: string;
  cue: string;
  effortMinutes: number;
  defaultPriority: Priority;
  freq: Frequency;
  interval: number;
  startDate: PlainDate;
  endDate: PlainDate | null;
  /** WEEKLY: 0 (Sun) – 6 (Sat). */
  byWeekday: number[];
  /** MONTHLY / QUARTERLY / ANNUAL: 1–31, or -1 for the last day. */
  monthDay: number;
  /** "HH:MM", when the chore becomes available. */
  timeOfDay: string;
  deadline: Deadline;
  assignMode: AssignMode;
  eligibleMembershipIds: string[];
  checklist: string[];
  reviewPolicy: ReviewPolicy;
  requiresPhoto: boolean;
  rewardAmount: number;
  referencePhoto: ReferencePhotoChange;
}

const usesWeekdays = (freq: Frequency) => freq === "WEEKLY";
const usesMonthDay = (freq: Frequency) =>
  freq === "MONTHLY" || freq === "QUARTERLY" || freq === "ANNUAL";

export function timeToMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(total: number): string {
  const clamped = Math.min(Math.max(Math.round(total), 0), MINUTES_PER_DAY - 1);
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

/** Minutes from the start time until midnight; a midnight start gets the whole day. */
export function endOfDayMinutes(timeOfDay: string): number {
  return MINUTES_PER_DAY - timeToMinutes(timeOfDay);
}

export function deadlineMinutes(form: Pick<ChoreForm, "deadline" | "timeOfDay">): number {
  return form.deadline.kind === "endOfDay"
    ? endOfDayMinutes(form.timeOfDay)
    : form.deadline.minutes;
}

/** The deadline choices the editor offers, besides "end of day". */
export const DEADLINE_PRESETS = [
  { minutes: 60, label: "1 hour" },
  { minutes: 3 * 60, label: "3 hours" },
  { minutes: MINUTES_PER_DAY, label: "1 day" },
  { minutes: 3 * MINUTES_PER_DAY, label: "3 days" },
  { minutes: 7 * MINUTES_PER_DAY, label: "1 week" },
] as const;

/** "45 min", "3 hours", "1 day", "1 day 6 hours", "2 weeks". */
export function describeDuration(minutes: number): string {
  const unit = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  if (minutes < 60) return `${minutes} min`;
  if (minutes % (7 * MINUTES_PER_DAY) === 0) return unit(minutes / (7 * MINUTES_PER_DAY), "week");
  const days = Math.floor(minutes / MINUTES_PER_DAY);
  const hours = Math.floor((minutes % MINUTES_PER_DAY) / 60);
  const mins = minutes % 60;
  const parts = [
    days > 0 ? unit(days, "day") : "",
    hours > 0 ? unit(hours, "hour") : "",
    mins > 0 ? `${mins} min` : "",
  ];
  return parts.filter(Boolean).join(" ");
}

export function newChoreForm(today: PlainDate): ChoreForm {
  return {
    kind: "ROUTINE",
    xpOverride: null,
    name: "",
    description: "",
    cue: "",
    effortMinutes: 10,
    defaultPriority: "NORMAL",
    freq: "DAILY",
    interval: 1,
    startDate: today,
    endDate: null,
    byWeekday: [weekdayOf(today)],
    monthDay: toParts(today).day,
    timeOfDay: DEFAULT_TIME_OF_DAY,
    deadline: { kind: "endOfDay" },
    assignMode: "AUTO",
    eligibleMembershipIds: [],
    checklist: [],
    reviewPolicy: "REVIEW_EACH",
    requiresPhoto: false,
    rewardAmount: 0,
    referencePhoto: { kind: "unchanged" },
  };
}

/** Loads an existing chore into the editor, filling in the defaults the rule left implicit. */
export function formFromChore(chore: Chore): ChoreForm {
  const r = chore.recurrence;
  const startDate = r.startDate as PlainDate;
  const timeOfDay = r.timeOfDay ?? DEFAULT_TIME_OF_DAY;
  return {
    kind: chore.kind,
    xpOverride: chore.xpOverride,
    name: chore.name,
    description: chore.description,
    cue: chore.cue ?? "",
    effortMinutes: chore.effortMinutes,
    defaultPriority: chore.defaultPriority,
    freq: r.freq,
    interval: r.interval ?? 1,
    startDate,
    endDate: (r.endDate as PlainDate | undefined) ?? null,
    byWeekday: r.byWeekday ?? [weekdayOf(startDate)],
    monthDay: r.byMonthDay ?? toParts(startDate).day,
    timeOfDay,
    deadline:
      chore.deadlineMinutes === endOfDayMinutes(timeOfDay)
        ? { kind: "endOfDay" }
        : { kind: "minutes", minutes: chore.deadlineMinutes },
    assignMode: chore.assignMode,
    eligibleMembershipIds: chore.eligibleMembershipIds,
    checklist: chore.checklist.map((item) => item.text),
    reviewPolicy: chore.reviewPolicy,
    requiresPhoto: chore.requiresPhoto,
    rewardAmount: chore.rewardAmount,
    referencePhoto: { kind: "unchanged" },
  };
}

/** The recurrence rule the form describes, with only the fields its frequency uses. */
export function toRecurrence(form: ChoreForm): CreateChoreBody["recurrence"] {
  const rule: CreateChoreBody["recurrence"] = { freq: form.freq, startDate: form.startDate };
  if (form.freq !== "ONCE") {
    if (form.interval !== 1) rule.interval = form.interval;
    if (form.endDate !== null) rule.endDate = form.endDate;
  }
  if (usesWeekdays(form.freq)) rule.byWeekday = [...form.byWeekday].sort((a, b) => a - b);
  if (usesMonthDay(form.freq)) rule.byMonthDay = form.monthDay;
  if (form.timeOfDay !== DEFAULT_TIME_OF_DAY) rule.timeOfDay = form.timeOfDay;
  return rule;
}

/** The full create body. Blank checklist rows are dropped; a blank cue means none. */
export function toChoreBody(form: ChoreForm): CreateChoreBody {
  const cue = form.cue.trim();
  return {
    kind: form.kind,
    xpOverride: form.xpOverride,
    name: form.name.trim(),
    description: form.description.trim(),
    cue: cue === "" ? null : cue,
    effortMinutes: form.effortMinutes,
    defaultPriority: form.defaultPriority,
    requiresPhoto: form.requiresPhoto,
    reviewPolicy: form.reviewPolicy,
    rewardAmount: form.rewardAmount,
    recurrence: toRecurrence(form),
    deadlineMinutes: deadlineMinutes(form),
    assignMode: form.assignMode,
    eligibleMembershipIds: form.eligibleMembershipIds,
    checklist: form.checklist.map((s) => s.trim()).filter((s) => s !== ""),
    ...(form.referencePhoto.kind === "new" && {
      referencePhotoUploadId: form.referencePhoto.uploadId,
    }),
  };
}

/**
 * Only the fields that changed since `original`. Comparing normalized bodies
 * means loading and saving an untouched chore sends nothing, so it doesn't
 * re-plan anyone's chores for no reason.
 */
export function toUpdateBody(form: ChoreForm, original: Chore): UpdateChoreBody {
  const before = toChoreBody(formFromChore(original));
  const after = toChoreBody(form);
  const changed: Record<string, unknown> = {};
  for (const key of Object.keys(after) as (keyof CreateChoreBody)[]) {
    if (JSON.stringify(after[key]) !== JSON.stringify(before[key])) changed[key] = after[key];
  }
  if (form.referencePhoto.kind === "remove") changed.referencePhotoUploadId = null;
  return changed as UpdateChoreBody;
}

/** Friendlier wording for the schema's most common complaints. */
const FRIENDLY: Partial<Record<keyof CreateChoreBody, string>> = {
  name: "Give the chore a name (up to 80 characters).",
  cue: "Keep the cue short: up to 60 characters.",
  effortMinutes: "Effort must be 1 to 480 minutes.",
  deadlineMinutes: "The deadline must be between 1 minute and 90 days.",
  rewardAmount: "The reward must be a whole number, 0 or more.",
  xpOverride: "XP must be a whole number from 1 to 500.",
  checklist: "Up to 20 steps, each up to 120 characters.",
};

/** Problems keyed by top-level field (recurrence problems all go under "recurrence"). */
export type FormErrors = Partial<Record<keyof CreateChoreBody, string>>;

export function validateChoreForm(form: ChoreForm): FormErrors {
  const result = createChoreBodySchema.safeParse(toChoreBody(form));
  if (result.success) return {};
  const errors: FormErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof CreateChoreBody | undefined;
    if (field === undefined || errors[field] !== undefined) continue;
    // The FIXED-owner rule's own message is already friendly; so are recurrence messages.
    errors[field] =
      field === "eligibleMembershipIds" || field === "recurrence"
        ? issue.message
        : (FRIENDLY[field] ?? issue.message);
  }
  return errors;
}

/** "Billy & Sally", "Takes turns: Billy, Sally", "Balanced by capacity (everyone)". */
export function describeAssignment(
  chore: Pick<Chore, "assignMode" | "eligibleMembershipIds">,
  members: readonly Pick<Member, "id" | "displayName">[],
): string {
  const names = chore.eligibleMembershipIds
    .map((id) => members.find((m) => m.id === id)?.displayName)
    .filter((n): n is string => n !== undefined);
  switch (chore.assignMode) {
    case "FIXED":
      return names.length > 0 ? names.join(" & ") : "Nobody (owners have left)";
    case "ROTATE":
      return `Takes turns: ${names.length > 0 ? names.join(", ") : "everyone"}`;
    case "AUTO":
      return `Balanced by capacity (${names.length > 0 ? names.join(", ") : "everyone"})`;
    case "OPEN":
      return `Job board (${names.length > 0 ? names.join(", ") : "anyone"} can claim it)`;
  }
}
