/**
 * The family's rewards, for any screen that shows an amount: the summary
 * (balances and pending), whether rewards are on, and a formatter in the
 * family's currency.
 */
import { type QueryClient, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useApi, useFamily } from "../../state/AppProvider";
import { amountFormatter } from "./format";

/** Query keys that change when anything about rewards or the job board changes. */
export const REWARD_QUERY_KEYS = [
  "rewards",
  "ledger",
  "redemptions",
  "jobBoard",
  "progress",
] as const;

export function invalidateRewards(queryClient: QueryClient, familyId: string | undefined): void {
  for (const key of REWARD_QUERY_KEYS) {
    void queryClient.invalidateQueries({ queryKey: [key, familyId] });
  }
}

export function useRewards() {
  const api = useApi();
  const { familyId, membershipId, family } = useFamily();
  const currency = family.data?.family.rewardCurrency;
  const currencyCode = family.data?.family.currencyCode;
  const enabled = currency !== undefined && currency !== "NONE";

  const summary = useQuery({
    queryKey: ["rewards", familyId],
    queryFn: () => api.rewards(familyId!),
    enabled: familyId !== undefined && enabled,
    refetchInterval: 60_000,
  });
  const format = useMemo(() => amountFormatter(currency, currencyCode), [currency, currencyCode]);

  return {
    /** NONE, MONEY, or POINTS (undefined while loading). */
    currency,
    currencyCode,
    /** Rewards are on for this family. */
    enabled,
    /** Formats an amount in the family's currency; null when rewards are off. */
    format,
    summary,
    /** The viewer's own balance and pending amount. */
    mine: summary.data?.members.find((m) => m.member.membershipId === membershipId),
  };
}
