/**
 * Capacity-based chore assignment ("who does what, on which day").
 *
 * Each member has a weekly capacity: minutes per weekday they can spend on
 * chores (parents more, young kids less, 0 on days they're away). Each chore
 * occurrence has an effort in minutes and an assignment mode:
 *
 *   FIXED  — always the chore's owners (all of them, e.g. "Billy and Sally").
 *            Each owner is charged ceil(effort / owners) minutes.
 *   ROTATE — the next member of the pool after whoever had it last, in pool order.
 *   AUTO   — the pool member with the most room that day (see pickAuto).
 *
 *   OPEN   — nobody: the occurrence goes on the job board until someone in
 *            the pool claims it. It charges no one's capacity while unclaimed.
 *
 * For ROTATE, AUTO, and OPEN, an empty pool means "any family member".
 *
 * Occurrences are planned day by day in date order. Within a day, FIXED chores
 * go first (they're not negotiable), then ROTATE, then AUTO, largest/most
 * urgent first, so the flexible chores fill in around the fixed ones. Nothing
 * is ever left unassigned because of capacity: if nobody has room, the chore
 * still goes to whoever has the most room and is flagged `overCapacity`, so
 * parents can see the overloaded day and adjust.
 *
 * The planner is pure and deterministic: the same input always yields the
 * same plan (ties are broken by "least recently did this chore", then pool order).
 */
import type { PlainDate } from "./calendar.js";
import { weekdayOf } from "./calendar.js";
import { minutesPerAssignee } from "./schedule.js";
import type { ChoreStatus, Priority } from "./status.js";
import { priorityRank } from "./status.js";

export const ASSIGN_MODES = ["FIXED", "ROTATE", "AUTO", "OPEN"] as const;
export type AssignMode = (typeof ASSIGN_MODES)[number];

/** Indexed by Weekday (0 = Sunday). */
export const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

/** Minutes of chore time available per weekday. */
export type WeeklyCapacity = Record<WeekdayKey, number>;

export function capacityOn(weekly: WeeklyCapacity, date: PlainDate): number {
  return weekly[WEEKDAY_KEYS[weekdayOf(date)] as WeekdayKey];
}

export interface PlanMember {
  id: string;
  weeklyCapacity: WeeklyCapacity;
}

export interface PlanOccurrence {
  /** Caller's unique id for this occurrence, e.g. `${choreId}:${date}`. */
  key: string;
  choreId: string;
  date: PlainDate;
  effortMinutes: number;
  priority: Priority;
  mode: AssignMode;
  /** FIXED: the owners. ROTATE/AUTO: candidates in rotation order (empty = everyone). */
  pool: readonly string[];
}

export interface PlanHistory {
  /** choreId → member who most recently had this ROTATE chore. */
  lastRotationAssignee?: Readonly<Record<string, string>>;
  /** choreId → memberId → date they were last assigned it (AUTO tie-breaker). */
  lastAssignedOn?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** date → memberId → minutes already assigned (instances from earlier runs). */
  existingLoad?: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

export interface PlanInput {
  /** Active family members, in a stable order (used for ties and the default pool). */
  members: readonly PlanMember[];
  occurrences: readonly PlanOccurrence[];
  history?: PlanHistory;
}

export interface PlannedAssignment {
  key: string;
  date: PlainDate;
  assigneeIds: string[];
  /** True if this assignment pushed any assignee past their capacity for the day. */
  overCapacity: boolean;
  /** True for job-board occurrences: no assignee until claimed. */
  open: boolean;
}

export interface UnassignedOccurrence {
  key: string;
  reason: "NO_ELIGIBLE_MEMBERS";
}

export interface DayLoad {
  date: PlainDate;
  memberId: string;
  capacityMinutes: number;
  assignedMinutes: number;
}

export interface AssignmentPlan {
  assignments: PlannedAssignment[];
  unassigned: UnassignedOccurrence[];
  /** Per day, per member: capacity vs. assigned minutes (for the parents' week view). */
  load: DayLoad[];
}

const MODE_ORDER: Record<AssignMode, number> = { FIXED: 0, ROTATE: 1, AUTO: 2, OPEN: 3 };

export function planAssignments(input: PlanInput): AssignmentPlan {
  validateInput(input);
  const { members, occurrences, history = {} } = input;
  const memberById = new Map(members.map((m) => [m.id, m]));
  const allMemberIds = members.map((m) => m.id);

  // Mutable working state, seeded from history so repeated runs stay consistent.
  const load = new Map<string, Map<string, number>>();
  for (const [date, perMember] of Object.entries(history.existingLoad ?? {})) {
    load.set(date, new Map(Object.entries(perMember)));
  }
  const lastRotation = new Map(Object.entries(history.lastRotationAssignee ?? {}));
  const lastAssignedOn = new Map<string, Map<string, string>>();
  for (const [choreId, perMember] of Object.entries(history.lastAssignedOn ?? {})) {
    lastAssignedOn.set(choreId, new Map(Object.entries(perMember)));
  }

  const loadOf = (date: string, memberId: string): number => load.get(date)?.get(memberId) ?? 0;
  const addLoad = (date: string, memberId: string, minutes: number): void => {
    let day = load.get(date);
    if (!day) load.set(date, (day = new Map()));
    day.set(memberId, (day.get(memberId) ?? 0) + minutes);
  };
  const capacityOf = (memberId: string, date: PlainDate): number => {
    const member = memberById.get(memberId);
    return member ? capacityOn(member.weeklyCapacity, date) : 0;
  };
  const lastDid = (choreId: string, memberId: string): string =>
    lastAssignedOn.get(choreId)?.get(memberId) ?? ""; // "" sorts before any date: never did it

  const assignments: PlannedAssignment[] = [];
  const unassigned: UnassignedOccurrence[] = [];

  for (const occ of [...occurrences].sort(compareOccurrences)) {
    if (occ.mode === "OPEN") {
      assignments.push({
        key: occ.key,
        date: occ.date,
        assigneeIds: [],
        overCapacity: false,
        open: true,
      });
      continue;
    }
    const pool = resolvePool(occ, memberById, allMemberIds);
    if (pool.length === 0) {
      unassigned.push({ key: occ.key, reason: "NO_ELIGIBLE_MEMBERS" });
      continue;
    }

    let assigneeIds: string[];
    let minutesEach: number;
    if (occ.mode === "FIXED") {
      assigneeIds = pool;
      minutesEach = minutesPerAssignee(occ.effortMinutes, pool.length);
    } else if (occ.mode === "ROTATE") {
      const previous = lastRotation.get(occ.choreId);
      const previousIndex = previous === undefined ? -1 : pool.indexOf(previous);
      // If the previous assignee left the pool, indexOf is -1 and we restart at the top.
      assigneeIds = [pool[(previousIndex + 1) % pool.length] as string];
      minutesEach = occ.effortMinutes;
    } else {
      assigneeIds = [pickAuto(occ, pool, loadOf, capacityOf, lastDid)];
      minutesEach = occ.effortMinutes;
    }

    let overCapacity = false;
    for (const id of assigneeIds) {
      addLoad(occ.date, id, minutesEach);
      if (loadOf(occ.date, id) > capacityOf(id, occ.date)) overCapacity = true;
      let perMember = lastAssignedOn.get(occ.choreId);
      if (!perMember) lastAssignedOn.set(occ.choreId, (perMember = new Map()));
      perMember.set(id, occ.date);
    }
    if (occ.mode === "ROTATE") lastRotation.set(occ.choreId, assigneeIds[0] as string);

    assignments.push({ key: occ.key, date: occ.date, assigneeIds, overCapacity, open: false });
  }

  return { assignments, unassigned, load: summarizeLoad(load, members, capacityOf) };
}

/**
 * AUTO choice. Among members who can fit the chore today (capacity > 0 and
 * enough minutes left), pick the one with the highest share of their day still
 * free (remaining ÷ capacity). That spreads work in proportion to capacity: a
 * parent with 60 minutes ends up with about 4× the work of a kid with 15.
 * If nobody fits, pick whoever has the most minutes left (fewest over).
 * Ties: whoever did this chore least recently, then pool order.
 */
function pickAuto(
  occ: PlanOccurrence,
  pool: readonly string[],
  loadOf: (date: string, memberId: string) => number,
  capacityOf: (memberId: string, date: PlainDate) => number,
  lastDid: (choreId: string, memberId: string) => string,
): string {
  const candidates = pool.map((id, order) => {
    const capacity = capacityOf(id, occ.date);
    const remaining = capacity - loadOf(occ.date, id);
    return {
      id,
      order,
      remaining,
      fits: capacity > 0 && remaining >= occ.effortMinutes,
      freeShare: capacity > 0 ? remaining / capacity : 0,
      lastDid: lastDid(occ.choreId, id),
    };
  });
  type Candidate = (typeof candidates)[number];
  const tieBreak = (a: Candidate, b: Candidate): number =>
    a.lastDid < b.lastDid ? -1 : a.lastDid > b.lastDid ? 1 : a.order - b.order;

  const fitting = candidates.filter((c) => c.fits);
  const best =
    fitting.length > 0
      ? fitting.sort((a, b) => b.freeShare - a.freeShare || tieBreak(a, b))[0]
      : candidates.sort((a, b) => b.remaining - a.remaining || tieBreak(a, b))[0];
  return (best as Candidate).id;
}

function resolvePool(
  occ: PlanOccurrence,
  memberById: ReadonlyMap<string, PlanMember>,
  allMemberIds: readonly string[],
): string[] {
  if (occ.pool.length === 0) {
    return occ.mode === "FIXED" ? [] : [...allMemberIds];
  }
  // Ignore members who are no longer active; keep the caller's order.
  return [...new Set(occ.pool)].filter((id) => memberById.has(id));
}

function compareOccurrences(a: PlanOccurrence, b: PlanOccurrence): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return (
    MODE_ORDER[a.mode] - MODE_ORDER[b.mode] ||
    priorityRank(b.priority) - priorityRank(a.priority) ||
    b.effortMinutes - a.effortMinutes ||
    (a.choreId < b.choreId ? -1 : a.choreId > b.choreId ? 1 : 0) ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );
}

function summarizeLoad(
  load: ReadonlyMap<string, ReadonlyMap<string, number>>,
  members: readonly PlanMember[],
  capacityOf: (memberId: string, date: PlainDate) => number,
): DayLoad[] {
  const dates = [...load.keys()].sort() as PlainDate[];
  return dates.flatMap((date) =>
    members.map((m) => ({
      date,
      memberId: m.id,
      capacityMinutes: capacityOf(m.id, date),
      assignedMinutes: load.get(date)?.get(m.id) ?? 0,
    })),
  );
}

function validateInput(input: PlanInput): void {
  const memberIds = new Set<string>();
  for (const m of input.members) {
    if (memberIds.has(m.id)) throw new RangeError(`Duplicate member id "${m.id}"`);
    memberIds.add(m.id);
    for (const key of WEEKDAY_KEYS) {
      const minutes = m.weeklyCapacity[key];
      if (!Number.isInteger(minutes) || minutes < 0) {
        throw new RangeError(`Member "${m.id}" has invalid ${key} capacity: ${minutes}`);
      }
    }
  }
  const keys = new Set<string>();
  for (const occ of input.occurrences) {
    if (keys.has(occ.key)) throw new RangeError(`Duplicate occurrence key "${occ.key}"`);
    keys.add(occ.key);
    if (!Number.isInteger(occ.effortMinutes) || occ.effortMinutes < 0) {
      throw new RangeError(`Occurrence "${occ.key}" has invalid effort: ${occ.effortMinutes}`);
    }
  }
}

/** Statuses whose minutes don't count against anyone's day (withdrawn or declined work). */
export const LOAD_EXCLUDED_STATUSES: ReadonlySet<ChoreStatus> = new Set(["CANCELED", "REJECTED"]);

/** The parts of a planned occurrence that count toward a member's day. */
export interface LoadedInstance {
  date: PlainDate;
  status: ChoreStatus;
  effortMinutes: number;
  assigneeIds: readonly string[];
}

/**
 * Minutes charged per date, per member: each assignee is charged
 * `minutesPerAssignee(effort, assignees)`, the same split the planner uses.
 * CANCELED and REJECTED occurrences are not counted.
 */
export function loadByDay(
  instances: Iterable<LoadedInstance>,
): Record<string, Record<string, number>> {
  const load: Record<string, Record<string, number>> = {};
  for (const inst of instances) {
    if (LOAD_EXCLUDED_STATUSES.has(inst.status)) continue;
    const minutes = minutesPerAssignee(inst.effortMinutes, inst.assigneeIds.length);
    const day = (load[inst.date] ??= {});
    for (const id of inst.assigneeIds) day[id] = (day[id] ?? 0) + minutes;
  }
  return load;
}

export interface DayLoadSummary extends DayLoad {
  /** Assigned more minutes than the member has that day. */
  overCapacity: boolean;
}

/**
 * Capacity vs. assigned minutes for each of `dates` × `members`, in the given
 * order (for the parents' week view). Assignees who aren't in `members` (e.g.
 * removed from the family) are ignored.
 */
export function summarizeDayLoad(
  members: readonly PlanMember[],
  instances: Iterable<LoadedInstance>,
  dates: readonly PlainDate[],
): DayLoadSummary[] {
  const load = loadByDay(instances);
  return dates.flatMap((date) =>
    members.map((m) => {
      const capacityMinutes = capacityOn(m.weeklyCapacity, date);
      const assignedMinutes = load[date]?.[m.id] ?? 0;
      return {
        date,
        memberId: m.id,
        capacityMinutes,
        assignedMinutes,
        overCapacity: assignedMinutes > capacityMinutes,
      };
    }),
  );
}
