/**
 * Rewards: balances, the ledger behind them, payouts and corrections, the
 * points catalog, redemption requests, and the job board.
 *
 * Amounts are integers: cents for money, points for points. Balances are
 * computed from the ledger, per currency; a family that switches currency
 * keeps its earlier balances (`otherBalances`) until a parent settles them.
 */
import {
  LEDGER_TYPES,
  MAX_AMOUNT,
  MONEY_CODES,
  REDEMPTION_STATUSES,
  REWARD_CURRENCIES,
} from "@titan/domain";
import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.js";
import { instanceSchema, personSchema } from "./instances.js";

/** A currency an amount can be held in (not NONE). */
export const coinCurrencySchema = z.enum(["MONEY", "POINTS"]);
const amountSchema = z.int().min(1).max(MAX_AMOUNT);
const noteSchema = z.string().trim().min(1).max(200);

export const memberRewardsSchema = z.object({
  member: personSchema,
  /** In the family's current currency (0 when rewards are off). May be negative after an advance. */
  balance: z.int(),
  /** Rewards for chores waiting for review: shown, not yet earned. */
  pending: z.int(),
  /** Non-zero balances left in a currency the family used before. */
  otherBalances: z.array(
    z.object({
      currency: coinCurrencySchema,
      currencyCode: z.string().nullable(),
      balance: z.int(),
    }),
  ),
});
export type MemberRewards = z.infer<typeof memberRewardsSchema>;

export const rewardsSummarySchema = z.object({
  currency: z.enum(REWARD_CURRENCIES),
  currencyCode: z.string(),
  /** Parents see everyone; kids see only themselves. */
  members: z.array(memberRewardsSchema),
});
export type RewardsSummary = z.infer<typeof rewardsSummarySchema>;

export const ledgerEntrySchema = z.object({
  id: idSchema,
  membershipId: idSchema,
  currency: coinCurrencySchema,
  currencyCode: z.string().nullable(),
  /** Signed. */
  amount: z.int(),
  type: z.enum(LEDGER_TYPES),
  note: z.string().nullable(),
  /** For EARNED entries. */
  choreName: z.string().nullable(),
  /** For REDEMPTION and REDEMPTION_REFUND entries. */
  itemName: z.string().nullable(),
  /** The parent who recorded it; null for automatic entries. */
  createdBy: personSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

export const ledgerQuerySchema = z.object({
  /** Default: yourself. Kids can only read their own. */
  memberId: idSchema.optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const ledgerPageSchema = z.object({
  items: z.array(ledgerEntrySchema),
  nextCursor: z.string().nullable(),
});
export type LedgerPage = z.infer<typeof ledgerPageSchema>;

/** "I paid Billy $5." May exceed the balance (an advance); the balance then goes negative. */
export const payoutBodySchema = z.strictObject({
  memberId: idSchema,
  /** Cents. */
  amount: amountSchema,
  /** Default: the family's currency code. Set it to settle a balance in an earlier one. */
  currencyCode: z.enum(MONEY_CODES).optional(),
  note: noteSchema.optional(),
});
export type PayoutBody = z.infer<typeof payoutBodySchema>;

/** Fixes a mistake. Always labeled as a correction, and always explained. */
export const correctionBodySchema = z.strictObject({
  memberId: idSchema,
  currency: coinCurrencySchema,
  currencyCode: z.enum(MONEY_CODES).optional(),
  /** Signed, not zero. */
  amount: z
    .int()
    .min(-MAX_AMOUNT)
    .max(MAX_AMOUNT)
    .refine((n) => n !== 0, "The amount can't be zero"),
  note: noteSchema,
});
export type CorrectionBody = z.infer<typeof correctionBodySchema>;

export const ledgerChangeResponseSchema = z.object({
  entry: ledgerEntrySchema,
  /** The member's balance in that entry's currency afterwards. */
  balance: z.int(),
});
export type LedgerChangeResponse = z.infer<typeof ledgerChangeResponseSchema>;

// The points catalog

export const rewardItemSchema = z.object({
  id: idSchema,
  name: z.string(),
  /** Points. */
  cost: z.int(),
  active: z.boolean(),
});
export type RewardItem = z.infer<typeof rewardItemSchema>;
export const rewardItemListSchema = z.object({ items: z.array(rewardItemSchema) });
export type RewardItemList = z.infer<typeof rewardItemListSchema>;

export const createRewardItemBodySchema = z.strictObject({
  name: z.string().trim().min(1).max(60),
  cost: amountSchema,
});
export type CreateRewardItemBody = z.infer<typeof createRewardItemBodySchema>;
export const updateRewardItemBodySchema = createRewardItemBodySchema.partial();
export type UpdateRewardItemBody = z.infer<typeof updateRewardItemBodySchema>;
export const rewardItemParamsSchema = z.object({ familyId: idSchema, itemId: idSchema });

// Redemption requests

export const redemptionSchema = z.object({
  id: idSchema,
  member: personSchema,
  itemId: idSchema,
  itemName: z.string(),
  cost: z.int(),
  status: z.enum(REDEMPTION_STATUSES),
  note: z.string().nullable(),
  decidedBy: personSchema.nullable(),
  decidedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type Redemption = z.infer<typeof redemptionSchema>;
export const redemptionListSchema = z.object({ items: z.array(redemptionSchema) });
export type RedemptionList = z.infer<typeof redemptionListSchema>;

export const createRedemptionBodySchema = z.strictObject({ itemId: idSchema });
export const redemptionQuerySchema = z.object({
  status: z.enum(REDEMPTION_STATUSES).optional(),
});
export const redemptionParamsSchema = z.object({ familyId: idSchema, redemptionId: idSchema });
export const redemptionDecisionBodySchema = z.strictObject({
  action: z.enum(["APPROVE", "DENY"]),
  note: noteSchema.optional(),
});
export type RedemptionDecisionBody = z.infer<typeof redemptionDecisionBodySchema>;

// Job board

/** Open jobs the viewer can claim right now. */
export const jobBoardSchema = z.object({ items: z.array(instanceSchema) });
export type JobBoard = z.infer<typeof jobBoardSchema>;
