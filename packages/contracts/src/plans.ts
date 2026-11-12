import { PLAN_TIERS, PRO_FEATURES } from "@tenara/domain";
import { z } from "zod";
import { isoDateTimeSchema } from "./common.js";

/** A family's plan, as the app shows it. The API decides everything; this is for display. */
export const planSchema = z.object({
  tier: z.enum(PLAN_TIERS),
  /** Why it's Pro, or null on Basic. */
  reason: z.enum(["TRIAL", "SUBSCRIPTION"]).nullable(),
  /** When Pro ends, or null on Basic. */
  endsAt: isoDateTimeSchema.nullable(),
  /** The free trial has been used up. */
  trialUsed: z.boolean(),
  /** A subscription will renew at endsAt (false once cancelled). */
  willRenew: z.boolean(),
  /** Where the subscription was bought, so the app can link to the right place to manage it. */
  store: z.enum(["APP_STORE", "PLAY_STORE", "WEB", "PROMOTIONAL", "OTHER"]).nullable(),
  /** Every Pro feature with whether this family has it now. */
  features: z.record(z.enum(PRO_FEATURES), z.boolean()),
  limits: z.object({
    maxParents: z.int().nullable(),
    maxKids: z.int().nullable(),
    historyDays: z.int().nullable(),
  }),
});
export type Plan = z.infer<typeof planSchema>;
