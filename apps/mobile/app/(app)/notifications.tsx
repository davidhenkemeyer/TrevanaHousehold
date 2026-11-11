/**
 * Notifications inbox: everything that happened for this person, newest
 * first, whether or not it was also pushed. Tapping one opens what it's about.
 * Opening the inbox doesn't mark everything read; "Mark all read" does.
 */
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Notification } from "@titan/contracts";
import { useRouter } from "expo-router";
import { Pressable, RefreshControl, View } from "react-native";
import { GradientHeader } from "../../src/components/brand";
import { BackLink } from "../../src/components/forms";
import { Screen, errorMessage } from "../../src/components/Screen";
import { AppText, Button, Card, ErrorText } from "../../src/components/ui";
import { targetOf, whenLabel } from "../../src/features/notifications/settings";
import { useApi, useFamily } from "../../src/state/AppProvider";
import { colors, spacing } from "../../src/theme";

export default function Notifications() {
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { familyId } = useFamily();

  const inbox = useInfiniteQuery({
    queryKey: ["notifications", familyId, "inbox"],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => api.inbox(familyId!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: familyId !== undefined,
  });
  const items = inbox.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = inbox.data?.pages[0]?.unreadCount ?? 0;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["notifications", familyId] });
  const markRead = useMutation({
    mutationFn: (ids?: string[]) => api.markRead(familyId!, ids),
    onSettled: () => void refresh(),
  });

  const open = (n: Notification) => {
    if (!n.read) markRead.mutate([n.id]);
    const target = targetOf(n);
    if (target) router.push(target);
  };

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={inbox.isRefetching} onRefresh={() => void refresh()} />
      }
      header={
        <GradientHeader>
          <BackLink onPress={() => router.back()} />
          <AppText variant="h1" color={colors.onPrimary} accessibilityRole="header">
            Notifications
          </AppText>
          <AppText color={colors.onPrimary}>
            {unread === 0 ? "You're all caught up." : `${unread} new`}
          </AppText>
        </GradientHeader>
      }
    >
      <ErrorText message={errorMessage(inbox.error ?? markRead.error)} />
      <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
        {unread > 0 && (
          <Button
            title="Mark all read"
            variant="secondary"
            onPress={() => markRead.mutate(undefined)}
            loading={markRead.isPending && markRead.variables === undefined}
          />
        )}
        <Button
          title="Notification settings"
          variant="ghost"
          onPress={() => router.push("/notification-settings")}
        />
      </View>

      {inbox.isSuccess && items.length === 0 && (
        <Card style={{ alignItems: "center", gap: spacing.sm }}>
          <AppText variant="h2">Nothing yet</AppText>
          <AppText color={colors.textMuted} style={{ textAlign: "center" }}>
            When something happens with your chores or rewards, it shows up here.
          </AppText>
        </Card>
      )}

      {items.map((n) => (
        <Pressable
          key={n.id}
          accessibilityRole="button"
          accessibilityLabel={`${n.read ? "" : "New: "}${n.title}. ${n.body}`}
          onPress={() => open(n)}
        >
          <Card style={{ gap: spacing.xxs, borderColor: n.read ? colors.border : colors.primary }}>
            <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "baseline" }}>
              <AppText
                variant={n.read ? "body" : "bodyStrong"}
                style={{ flex: 1 }}
                numberOfLines={2}
              >
                {n.title}
              </AppText>
              <AppText variant="caption" color={colors.textMuted}>
                {whenLabel(n.createdAt)}
              </AppText>
            </View>
            <AppText variant="caption" color={colors.textMuted}>
              {n.body}
            </AppText>
          </Card>
        </Pressable>
      ))}

      {inbox.hasNextPage && (
        <Button
          title="Load more"
          variant="ghost"
          onPress={() => void inbox.fetchNextPage()}
          loading={inbox.isFetchingNextPage}
        />
      )}
    </Screen>
  );
}
