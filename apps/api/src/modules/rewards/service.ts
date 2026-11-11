/**
 * Rewards: balances, the ledger, payouts and corrections, the points catalog,
 * redemption requests, and the job board listing.
 *
 * Rules kept here (see packages/domain/src/rewards.ts for the why):
 *   - Balances are sums over LedgerEntry, per member and currency. Nothing
 *     else stores a balance.
 *   - Entries are only ever added. Chore rewards come from hooks.ts
 *     (onApproved); everything else is written in this file.
 *   - The only ways an amount goes down: a payout, a redemption, or a
 *     correction, and a correction always has a note.
 *   - Spending points locks the member's row first, so two requests at once
 *     can't both spend the same points.
 */
import type {
  CorrectionBody,
  CreateRewardItemBody,
  JobBoard,
  LedgerChangeResponse,
  LedgerEntry as LedgerEntryDto,
  LedgerPage,
  MemberRewards,
  PayoutBody,
  Redemption as RedemptionDto,
  RedemptionDecisionBody,
  RedemptionList,
  RewardItem as RewardItemDto,
  RewardItemList,
  RewardsSummary,
  UpdateRewardItemBody,
} from "@titan/contracts";
import {
  type CoinCurrency,
  type RedemptionStatus,
  canRedeem,
  earnings,
  formatAmount,
} from "@titan/domain";
import { z } from "zod";
import type { Deps } from "../../deps.js";
import { AppError, conflict, forbidden, notFound } from "../../errors.js";
import type { Membership, Prisma, RewardItem } from "../../generated/prisma/client.js";
import { decodeCursor, encodeCursor } from "../../lib/cursor.js";
import { requireMember, requireParent } from "../access.js";
import { displayNameOf, notify, parentsOf } from "../notifications/service.js";
import {
  inPool,
  instanceInclude,
  photoSigner,
  toInstanceDto,
  toPerson,
} from "../instances/views.js";

type Tx = Prisma.TransactionClient;
type DbOrTx = Deps["db"] | Tx;

const memberWithUser = { include: { user: true } } as const;

const ledgerInclude = {
  createdBy: memberWithUser,
  instance: { select: { chore: { select: { name: true } } } },
  redemption: { select: { itemName: true } },
} as const satisfies Prisma.LedgerEntryInclude;
type LedgerRow = Prisma.LedgerEntryGetPayload<{ include: typeof ledgerInclude }>;

function toLedgerDto(row: LedgerRow): LedgerEntryDto {
  return {
    id: row.id,
    membershipId: row.membershipId,
    currency: row.currency as CoinCurrency,
    currencyCode: row.currencyCode,
    amount: row.amount,
    type: row.type,
    note: row.note,
    choreName: row.instance?.chore.name ?? null,
    itemName: row.redemption?.itemName ?? null,
    createdBy: row.createdBy ? toPerson(row.createdBy) : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** A member's balance in one currency (money balances are per currency code). */
async function balance(
  db: DbOrTx,
  membershipId: string,
  currency: CoinCurrency,
  currencyCode: string | null,
): Promise<number> {
  const sum = await db.ledgerEntry.aggregate({
    where: { membershipId, currency, currencyCode },
    _sum: { amount: true },
  });
  return sum._sum.amount ?? 0;
}

/** An active member of this family, or 404. */
async function findMember(db: DbOrTx, familyId: string, membershipId: string) {
  const member = await db.membership.findFirst({
    where: { id: membershipId, familyId, active: true },
  });
  if (!member) throw notFound("MEMBER_NOT_FOUND", "That person isn't in this family.");
  return member;
}

export async function getRewards(
  deps: Deps,
  userId: string,
  familyId: string,
): Promise<RewardsSummary> {
  const viewer = await requireMember(deps.db, familyId, userId);
  const family = await deps.db.family.findUniqueOrThrow({ where: { id: familyId } });
  const members = await deps.db.membership.findMany({
    where: viewer.role === "PARENT" ? { familyId, active: true } : { id: viewer.id, familyId },
    orderBy: { createdAt: "asc" },
    ...memberWithUser,
  });
  const ids = members.map((m) => m.id);

  const sums = await deps.db.ledgerEntry.groupBy({
    by: ["membershipId", "currency", "currencyCode"],
    where: { familyId, membershipId: { in: ids } },
    _sum: { amount: true },
  });

  // Pending: rewards of chores waiting for review. Computed, never stored,
  // so a rejection has nothing to undo.
  const pending = new Map<string, number>();
  if (family.rewardCurrency !== "NONE") {
    const waiting = await deps.db.choreInstance.findMany({
      where: { familyId, status: "PENDING_REVIEW", rewardAmount: { gt: 0 } },
      select: { rewardAmount: true, assignees: { select: { membershipId: true } } },
    });
    for (const instance of waiting) {
      const shares = earnings(
        instance.rewardAmount,
        instance.assignees.map((a) => a.membershipId),
      );
      for (const [id, amount] of shares) pending.set(id, (pending.get(id) ?? 0) + amount);
    }
  }

  const currentCode = family.rewardCurrency === "MONEY" ? family.currencyCode : null;
  const isCurrent = (s: (typeof sums)[number]) =>
    s.currency === family.rewardCurrency && s.currencyCode === currentCode;

  const rows: MemberRewards[] = members.map((m) => {
    const mine = sums.filter((s) => s.membershipId === m.id);
    return {
      member: toPerson(m),
      balance: mine.find(isCurrent)?._sum.amount ?? 0,
      pending: pending.get(m.id) ?? 0,
      otherBalances: mine
        .filter((s) => !isCurrent(s) && (s._sum.amount ?? 0) !== 0)
        .map((s) => ({
          currency: s.currency as CoinCurrency,
          currencyCode: s.currencyCode,
          balance: s._sum.amount ?? 0,
        })),
    };
  });
  return { currency: family.rewardCurrency, currencyCode: family.currencyCode, members: rows };
}

const ledgerCursorSchema = z.object({ t: z.string(), id: z.string() });

export async function getLedger(
  deps: Deps,
  userId: string,
  familyId: string,
  query: { memberId?: string | undefined; cursor?: string | undefined; limit: number },
): Promise<LedgerPage> {
  const viewer = await requireMember(deps.db, familyId, userId);
  const memberId = query.memberId ?? viewer.id;
  if (memberId !== viewer.id) {
    if (viewer.role !== "PARENT") {
      throw forbidden("PARENT_REQUIRED", "You can only see your own rewards.");
    }
    await findMember(deps.db, familyId, memberId);
  }
  const after = decodeCursor(query.cursor, ledgerCursorSchema);
  const rows = await deps.db.ledgerEntry.findMany({
    where: {
      familyId,
      membershipId: memberId,
      ...(after && {
        OR: [
          { createdAt: { lt: new Date(after.t) } },
          { createdAt: new Date(after.t), id: { lt: after.id } },
        ],
      }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    include: ledgerInclude,
  });
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: page.map(toLedgerDto),
    nextCursor:
      rows.length > query.limit && last
        ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id })
        : null,
  };
}

async function addEntry(
  tx: Tx,
  data: Prisma.LedgerEntryUncheckedCreateInput,
): Promise<LedgerChangeResponse> {
  const row = await tx.ledgerEntry.create({ data, include: ledgerInclude });
  return {
    entry: toLedgerDto(row),
    balance: await balance(tx, row.membershipId, row.currency as CoinCurrency, row.currencyCode),
  };
}

/** "I paid Billy $5." May exceed the balance (an advance): the balance then goes negative. */
export async function recordPayout(
  deps: Deps,
  userId: string,
  familyId: string,
  body: PayoutBody,
): Promise<LedgerChangeResponse> {
  const parent = await requireParent(deps.db, familyId, userId);
  const member = await findMember(deps.db, familyId, body.memberId);
  const family = await deps.db.family.findUniqueOrThrow({ where: { id: familyId } });
  const currencyCode = body.currencyCode ?? family.currencyCode;
  return deps.db.$transaction(async (tx) => {
    // Money must be in use, or there must be an earlier money balance to settle.
    const using = family.rewardCurrency === "MONEY" && currencyCode === family.currencyCode;
    if (!using && (await balance(tx, member.id, "MONEY", currencyCode)) === 0) {
      throw conflict(
        "MONEY_NOT_IN_USE",
        "This family's rewards aren't in money, and there's no money balance to pay out.",
      );
    }
    return addEntry(tx, {
      familyId,
      membershipId: member.id,
      currency: "MONEY",
      currencyCode,
      amount: -body.amount,
      type: "PAYOUT",
      note: body.note ?? null,
      createdById: parent.id,
      createdAt: deps.now(),
    });
  });
}

/** Fixes a mistake, in either direction. Always labeled a correction, always explained. */
export async function recordCorrection(
  deps: Deps,
  userId: string,
  familyId: string,
  body: CorrectionBody,
): Promise<LedgerChangeResponse> {
  const parent = await requireParent(deps.db, familyId, userId);
  const member = await findMember(deps.db, familyId, body.memberId);
  const family = await deps.db.family.findUniqueOrThrow({ where: { id: familyId } });
  return deps.db.$transaction((tx) =>
    addEntry(tx, {
      familyId,
      membershipId: member.id,
      currency: body.currency,
      currencyCode: body.currency === "MONEY" ? (body.currencyCode ?? family.currencyCode) : null,
      amount: body.amount,
      type: "CORRECTION",
      note: body.note,
      createdById: parent.id,
      createdAt: deps.now(),
    }),
  );
}

// The points catalog

const toItemDto = (item: RewardItem): RewardItemDto => ({
  id: item.id,
  name: item.name,
  cost: item.cost,
  active: item.active,
});

export async function listRewardItems(
  deps: Deps,
  userId: string,
  familyId: string,
): Promise<RewardItemList> {
  await requireMember(deps.db, familyId, userId);
  const items = await deps.db.rewardItem.findMany({
    where: { familyId, active: true },
    orderBy: [{ cost: "asc" }, { name: "asc" }],
  });
  return { items: items.map(toItemDto) };
}

export async function createRewardItem(
  deps: Deps,
  userId: string,
  familyId: string,
  body: CreateRewardItemBody,
): Promise<RewardItemDto> {
  await requireParent(deps.db, familyId, userId);
  return toItemDto(await deps.db.rewardItem.create({ data: { familyId, ...body } }));
}

async function findItem(db: DbOrTx, familyId: string, itemId: string): Promise<RewardItem> {
  const item = await db.rewardItem.findFirst({ where: { id: itemId, familyId, active: true } });
  if (!item) throw notFound("REWARD_NOT_FOUND", "That reward isn't in the catalog any more.");
  return item;
}

export async function updateRewardItem(
  deps: Deps,
  userId: string,
  familyId: string,
  itemId: string,
  body: UpdateRewardItemBody,
): Promise<RewardItemDto> {
  await requireParent(deps.db, familyId, userId);
  await findItem(deps.db, familyId, itemId);
  return toItemDto(
    await deps.db.rewardItem.update({
      where: { id: itemId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.cost !== undefined && { cost: body.cost }),
      },
    }),
  );
}

/** Hides the reward. Earlier requests keep their own name and cost. */
export async function removeRewardItem(
  deps: Deps,
  userId: string,
  familyId: string,
  itemId: string,
): Promise<void> {
  await requireParent(deps.db, familyId, userId);
  await findItem(deps.db, familyId, itemId);
  await deps.db.rewardItem.update({ where: { id: itemId }, data: { active: false } });
}

// Redemption requests

const redemptionInclude = {
  membership: memberWithUser,
  decidedBy: memberWithUser,
} as const satisfies Prisma.RedemptionInclude;
type RedemptionRow = Prisma.RedemptionGetPayload<{ include: typeof redemptionInclude }>;

function toRedemptionDto(row: RedemptionRow): RedemptionDto {
  return {
    id: row.id,
    member: toPerson(row.membership),
    itemId: row.itemId,
    itemName: row.itemName,
    cost: row.cost,
    status: row.status,
    note: row.note,
    decidedBy: row.decidedBy ? toPerson(row.decidedBy) : null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Asks for a reward. The points are held right away, so they can't be spent twice. */
export async function requestRedemption(
  deps: Deps,
  userId: string,
  familyId: string,
  itemId: string,
): Promise<RedemptionDto> {
  const member = await requireMember(deps.db, familyId, userId);
  const family = await deps.db.family.findUniqueOrThrow({ where: { id: familyId } });
  if (family.rewardCurrency !== "POINTS") {
    throw conflict("POINTS_NOT_IN_USE", "This family isn't using points right now.");
  }
  const item = await findItem(deps.db, familyId, itemId);
  const now = deps.now();
  return deps.db.$transaction(async (tx) => {
    // Lock this member's row: concurrent requests wait here, then see the new balance.
    await tx.$queryRaw`SELECT id FROM "Membership" WHERE id = ${member.id}::uuid FOR UPDATE`;
    const points = await balance(tx, member.id, "POINTS", null);
    if (!canRedeem(points, item.cost)) {
      throw conflict("NOT_ENOUGH_POINTS", `That costs ${item.cost} points and you have ${points}.`);
    }
    const redemption = await tx.redemption.create({
      data: {
        familyId,
        membershipId: member.id,
        itemId: item.id,
        itemName: item.name,
        cost: item.cost,
        createdAt: now,
      },
      include: redemptionInclude,
    });
    await tx.ledgerEntry.create({
      data: {
        familyId,
        membershipId: member.id,
        currency: "POINTS",
        amount: -item.cost,
        type: "REDEMPTION",
        redemptionId: redemption.id,
        createdAt: now,
      },
    });
    await notify(tx, now, {
      familyId,
      to: await parentsOf(tx, familyId),
      exclude: member.id,
      type: "REDEMPTION_REQUESTED",
      details: {
        actorName: redemption.membership.user.displayName,
        itemName: item.name,
        costText: formatAmount("POINTS", null, item.cost),
      },
      data: { redemptionId: redemption.id },
    });
    return toRedemptionDto(redemption);
  });
}

export async function listRedemptions(
  deps: Deps,
  userId: string,
  familyId: string,
  query: { status?: RedemptionStatus | undefined },
): Promise<RedemptionList> {
  const viewer = await requireMember(deps.db, familyId, userId);
  const rows = await deps.db.redemption.findMany({
    where: {
      familyId,
      ...(viewer.role !== "PARENT" && { membershipId: viewer.id }),
      ...(query.status !== undefined && { status: query.status }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
    include: redemptionInclude,
  });
  return { items: rows.map(toRedemptionDto) };
}

/**
 * Closes a request that's still open. Guarded, so a decision and a cancel
 * arriving together can't both apply; anything but approval gives the points back.
 */
async function closeRedemption(
  deps: Deps,
  familyId: string,
  redemptionId: string,
  status: Exclude<RedemptionStatus, "REQUESTED">,
  by: Membership,
  note: string | undefined,
  only?: { membershipId: string },
): Promise<RedemptionDto> {
  const now = deps.now();
  return deps.db.$transaction(async (tx) => {
    const existing = await tx.redemption.findFirst({
      where: { id: redemptionId, familyId, ...only },
    });
    if (!existing) throw notFound("REDEMPTION_NOT_FOUND", "That request wasn't found.");
    const updated = await tx.redemption.updateMany({
      where: { id: redemptionId, status: "REQUESTED" },
      data: {
        status,
        note: note ?? null,
        decidedAt: now,
        // A cancel is the member's own doing, not a parent's decision.
        decidedById: status === "CANCELED" ? null : by.id,
      },
    });
    if (updated.count === 0) {
      throw new AppError(409, "ALREADY_DECIDED", "That request was already answered.");
    }
    if (status !== "CANCELED") {
      await notify(tx, now, {
        familyId,
        to: [existing.membershipId],
        exclude: by.id,
        type: "REDEMPTION_DECIDED",
        details: {
          actorName: await displayNameOf(tx, by.id),
          itemName: existing.itemName,
          approved: status === "APPROVED",
          note: note ?? null,
        },
        data: { redemptionId },
      });
    }
    if (status !== "APPROVED") {
      await tx.ledgerEntry.create({
        data: {
          familyId,
          membershipId: existing.membershipId,
          currency: "POINTS",
          amount: existing.cost,
          type: "REDEMPTION_REFUND",
          redemptionId,
          createdById: status === "DENIED" ? by.id : null,
          createdAt: now,
        },
      });
    }
    return toRedemptionDto(
      await tx.redemption.findUniqueOrThrow({
        where: { id: redemptionId },
        include: redemptionInclude,
      }),
    );
  });
}

export async function decideRedemption(
  deps: Deps,
  userId: string,
  familyId: string,
  redemptionId: string,
  body: RedemptionDecisionBody,
): Promise<RedemptionDto> {
  const parent = await requireParent(deps.db, familyId, userId);
  return closeRedemption(
    deps,
    familyId,
    redemptionId,
    body.action === "APPROVE" ? "APPROVED" : "DENIED",
    parent,
    body.note,
  );
}

/** The person who asked changes their mind; the points come back. */
export async function cancelRedemption(
  deps: Deps,
  userId: string,
  familyId: string,
  redemptionId: string,
): Promise<RedemptionDto> {
  const member = await requireMember(deps.db, familyId, userId);
  // Someone else's request looks the same as a missing one.
  return closeRedemption(deps, familyId, redemptionId, "CANCELED", member, undefined, {
    membershipId: member.id,
  });
}

// Job board

/** Open jobs the viewer may claim: available now, not past their deadline, and open to them. */
export async function getJobBoard(deps: Deps, userId: string, familyId: string): Promise<JobBoard> {
  const viewer = await requireMember(deps.db, familyId, userId);
  const now = deps.now();
  const rows = await deps.db.choreInstance.findMany({
    where: {
      familyId,
      board: "OPEN",
      status: "NEW",
      availableAt: { lte: now },
      dueAt: { gt: now },
      chore: { active: true },
    },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    take: 100,
    include: instanceInclude,
  });
  const sign = photoSigner(deps);
  const mine = rows.filter((row) => inPool(row.chore.eligible, viewer.id));
  return {
    items: await Promise.all(
      mine.map((row) => toInstanceDto(row, { membershipId: viewer.id, role: viewer.role }, sign)),
    ),
  };
}
