/**
 * Requests to spend points, waiting for a parent: "Billy asks for 30 minutes
 * of screen time (50 pts)". Approve, or "Not now" (the points go back).
 * Shown at the top of the Review tab, so everything waiting on a parent is
 * in one place.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Redemption } from "@tenara/contracts";
import { View } from "react-native";
import { errorMessage } from "../../components/Screen";
import { AppText, Avatar, Button, Card, ErrorText } from "../../components/ui";
import { useApi, useFamily } from "../../state/AppProvider";
import { colors, spacing } from "../../theme";
import { invalidateRewards, useRewards } from "./useRewards";

/** The open requests (parents: everyone's). Shared by the list and the tab badge. */
export function useRedemptionRequests(enabled = true) {
  const api = useApi();
  const { familyId } = useFamily();
  const rewards = useRewards();
  return useQuery({
    queryKey: ["redemptions", familyId, "requested"],
    queryFn: () => api.redemptions(familyId!, "REQUESTED"),
    select: (list) => list.items,
    enabled: familyId !== undefined && enabled && rewards.currency === "POINTS",
    refetchInterval: 60_000,
  });
}

export function RedemptionRequests() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { familyId } = useFamily();
  const { format } = useRewards();
  const requests = useRedemptionRequests();

  const decide = useMutation({
    mutationFn: ({ request, action }: { request: Redemption; action: "APPROVE" | "DENY" }) =>
      api.decideRedemption(familyId!, request.id, { action }),
    onSettled: () => invalidateRewards(queryClient, familyId),
  });

  const items = requests.data ?? [];
  if (items.length === 0 || !format) return null;
  return (
    <View style={{ gap: spacing.md }}>
      <AppText variant="bodyStrong" color={colors.textMuted} accessibilityRole="header">
        {`Reward requests · ${items.length}`}
      </AppText>
      <ErrorText message={errorMessage(decide.error)} />
      {items.map((request) => {
        const busy = decide.isPending && decide.variables?.request.id === request.id;
        return (
          <Card key={request.id} style={{ gap: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <Avatar name={request.member.displayName} color={request.member.avatarColor} />
              <View style={{ flex: 1, gap: spacing.xxs }}>
                <AppText variant="bodyStrong">{request.itemName}</AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  {`${request.member.displayName} · ${format(request.cost)}`}
                </AppText>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button
                title="Approve"
                accessibilityLabel={`Approve ${request.itemName} for ${request.member.displayName}`}
                style={{ flex: 1 }}
                loading={busy && decide.variables?.action === "APPROVE"}
                disabled={busy}
                onPress={() => decide.mutate({ request, action: "APPROVE" })}
              />
              <Button
                title="Not now"
                accessibilityLabel={`Not now: ${request.itemName} for ${request.member.displayName}`}
                variant="secondary"
                style={{ flex: 1 }}
                disabled={busy}
                onPress={() => decide.mutate({ request, action: "DENY" })}
              />
            </View>
          </Card>
        );
      })}
    </View>
  );
}
