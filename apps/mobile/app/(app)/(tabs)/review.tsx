/**
 * Review (parents): the approval queue. Each card is one submitted chore;
 * swipe right (or tap Approve) to approve, swipe left (or tap Needs work) to
 * send it back or decline it. "Approve all low-stakes" clears every chore whose
 * review rule allows batch approval. Filter or group by child.
 *
 * The API decides who may review and what's batch-eligible; this screen
 * just shows its answers.
 */
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { ReviewBody, ReviewQueue, ReviewQueueItem } from "@titan/contracts";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Platform, RefreshControl, View } from "react-native";
import { GradientHeader } from "../../../src/components/brand";
import { SelectChip, ToggleRow } from "../../../src/components/forms";
import { Screen, errorMessage } from "../../../src/components/Screen";
import { AppText, Avatar, Button, Card, ErrorText } from "../../../src/components/ui";
import { DecisionSheet } from "../../../src/features/review/DecisionSheet";
import {
  batchEligibleIds,
  describeBatchResult,
  groupByChild,
} from "../../../src/features/review/queue";
import { ReviewCard } from "../../../src/features/review/ReviewCard";
import { useApi, useFamily } from "../../../src/state/AppProvider";
import { colors, spacing } from "../../../src/theme";

export default function Review() {
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { familyId, family } = useFamily();
  const [memberId, setMemberId] = useState<string | undefined>(undefined);
  const [grouped, setGrouped] = useState(false);
  const [needsWork, setNeedsWork] = useState<ReviewQueueItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const queue = useInfiniteQuery<
    ReviewQueue,
    Error,
    InfiniteData<ReviewQueue>,
    (string | undefined)[],
    string | undefined
  >({
    queryKey: ["reviewQueue", familyId, memberId],
    queryFn: ({ pageParam }) =>
      api.reviewQueue(familyId!, {
        ...(memberId !== undefined && { memberId }),
        ...(pageParam !== undefined && { cursor: pageParam }),
      }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: familyId !== undefined,
    refetchInterval: 60_000,
  });
  const items = useMemo(() => queue.data?.pages.flatMap((p) => p.items) ?? [], [queue.data]);
  const total = queue.data?.pages[0]?.total ?? 0;
  const eligible = batchEligibleIds(items);
  const kids = (family.data?.members ?? []).filter((m) => m.role === "CHILD");

  /** Everything a decision can change: the queue, Today, chore details, the week view. */
  const refreshAll = () =>
    Promise.all(
      ["reviewQueue", "agenda", "instance", "weekLoad"].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key, familyId] }),
      ),
    );

  const review = useMutation({
    mutationFn: ({ item, body }: { item: ReviewQueueItem; body: ReviewBody }) =>
      api.review(familyId!, item.submission.id, body),
    onMutate: ({ item }) => {
      setBusyId(item.submission.id);
      setNotice(null);
    },
    onSuccess: (_res, { body }) => {
      setNeedsWork(null);
      if (body.action === "APPROVE" && Platform.OS !== "web") {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
    onSettled: () => {
      setBusyId(null);
      void refreshAll();
    },
  });

  const batch = useMutation({
    mutationFn: () => api.batchApprove(familyId!, eligible),
    onMutate: () => setNotice(null),
    onSuccess: (res) => setNotice(describeBatchResult(res)),
    onSettled: () => void refreshAll(),
  });

  const approve = (item: ReviewQueueItem) => {
    if (busyId !== null) return;
    review.mutate({ item, body: { action: "APPROVE" } });
  };
  const open = (item: ReviewQueueItem) =>
    router.push({ pathname: "/chore/[id]", params: { id: item.instance.id } });

  const card = (item: ReviewQueueItem) => (
    <ReviewCard
      key={item.submission.id}
      item={item}
      busy={busyId === item.submission.id}
      onApprove={() => approve(item)}
      onNeedsWork={() => {
        review.reset();
        setNeedsWork(item);
      }}
      onOpen={() => open(item)}
    />
  );

  return (
    <View style={{ flex: 1 }}>
      <Screen
        refreshControl={
          <RefreshControl refreshing={queue.isRefetching} onRefresh={() => void refreshAll()} />
        }
        header={
          <GradientHeader>
            <AppText variant="h1" color={colors.onPrimary} accessibilityRole="header">
              Review
            </AppText>
            <AppText color={colors.onPrimary}>
              {queue.isSuccess
                ? total === 0
                  ? "Nothing waiting for you."
                  : `${total} waiting for you`
                : " "}
            </AppText>
          </GradientHeader>
        }
      >
        <ErrorText
          message={errorMessage(queue.error ?? batch.error ?? (needsWork ? null : review.error))}
        />
        {notice !== null && (
          <Card>
            <AppText accessibilityRole="text">{notice}</AppText>
          </Card>
        )}

        {kids.length > 1 && (
          <View style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
              <SelectChip
                label="Everyone"
                selected={memberId === undefined}
                onPress={() => setMemberId(undefined)}
              />
              {kids.map((k) => (
                <SelectChip
                  key={k.id}
                  label={k.displayName}
                  selected={memberId === k.id}
                  onPress={() => setMemberId(k.id)}
                />
              ))}
            </View>
            {memberId === undefined && (
              <ToggleRow label="Group by child" value={grouped} onChange={setGrouped} />
            )}
          </View>
        )}

        {eligible.length > 0 && (
          <Button
            title={`Approve all low-stakes (${eligible.length})`}
            variant="secondary"
            onPress={() => batch.mutate()}
            loading={batch.isPending}
          />
        )}

        {queue.isSuccess && items.length === 0 && (
          <Card style={{ alignItems: "center", gap: spacing.sm }}>
            <AppText variant="h2">All caught up!</AppText>
            <AppText color={colors.textMuted} style={{ textAlign: "center" }}>
              When someone finishes a chore, it shows up here for you to check.
            </AppText>
          </Card>
        )}

        {items.length > 0 && (
          <AppText variant="caption" color={colors.textMuted}>
            Swipe right to approve, left if it needs work.
          </AppText>
        )}

        {grouped && memberId === undefined
          ? groupByChild(items).map((group) => (
              <View key={group.membershipId} style={{ gap: spacing.md }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <Avatar name={group.displayName} color={group.avatarColor} size={28} />
                  <AppText variant="bodyStrong" color={colors.textMuted} accessibilityRole="header">
                    {`${group.displayName} · ${group.items.length}`}
                  </AppText>
                </View>
                {group.items.map(card)}
              </View>
            ))
          : items.map(card)}

        {queue.hasNextPage && (
          <Button
            title="Load more"
            variant="ghost"
            onPress={() => void queue.fetchNextPage()}
            loading={queue.isFetchingNextPage}
          />
        )}
      </Screen>

      <DecisionSheet
        target={
          needsWork && {
            key: needsWork.submission.id,
            childName: needsWork.submission.submittedBy.displayName,
            choreName: needsWork.instance.choreName,
          }
        }
        submitting={review.isPending}
        error={needsWork ? errorMessage(review.error) : null}
        onSubmit={(body) => needsWork && review.mutate({ item: needsWork, body })}
        onClose={() => setNeedsWork(null)}
      />
    </View>
  );
}
