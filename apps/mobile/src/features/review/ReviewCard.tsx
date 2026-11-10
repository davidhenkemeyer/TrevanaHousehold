/**
 * One submission in the approval queue. Swipe right to approve, swipe left
 * for "needs work" (rework or reject). The same actions are buttons on the
 * card, so it also works with a mouse, a keyboard, or a screen reader.
 *
 * Uses React Native's own PanResponder (no extra native dependency); it only
 * claims clearly horizontal drags, so vertical scrolling still works.
 */
import type { ReviewQueueItem } from "@titan/contracts";
import { useEffect, useMemo, useRef } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, View } from "react-native";
import { AppText, Avatar, Button, Card, Chip } from "../../components/ui";
import { colors, radii, spacing } from "../../theme";

/** How far (px) a drag must go to count as a swipe. */
const SWIPE_THRESHOLD = 96;

const submittedAt = (iso: string) =>
  new Date(iso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });

export function ReviewCard({
  item,
  busy,
  onApprove,
  onNeedsWork,
  onOpen,
}: {
  item: ReviewQueueItem;
  busy: boolean;
  onApprove: () => void;
  onNeedsWork: () => void;
  onOpen: () => void;
}) {
  const x = useRef(new Animated.Value(0)).current;
  // Latest callbacks, so the responder (created once) never calls stale ones.
  const handlers = useRef({ onApprove, onNeedsWork, busy });
  useEffect(() => {
    handlers.current = { onApprove, onNeedsWork, busy };
  }, [onApprove, onNeedsWork, busy]);

  // When the last drag ended. On the web, releasing the mouse after a swipe
  // also fires a click on whatever is under it; taps right after a drag are ignored.
  const lastDragEnd = useRef(0);
  const tap = (action: () => void) => () => {
    if (Date.now() - lastDragEnd.current > 400) action();
  };

  const responder = useMemo(() => {
    const settle = () =>
      Animated.spring(x, { toValue: 0, useNativeDriver: false, bounciness: 6 }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        !handlers.current.busy && Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_e, g) => x.setValue(g.dx),
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_e, g) => {
        lastDragEnd.current = Date.now();
        settle();
        if (g.dx > SWIPE_THRESHOLD) handlers.current.onApprove();
        else if (g.dx < -SWIPE_THRESHOLD) handlers.current.onNeedsWork();
      },
      onPanResponderTerminate: () => {
        lastDragEnd.current = Date.now();
        settle();
      },
    });
  }, [x]);

  const { submission, instance } = item;
  const { checked, total } = submission.checklistSummary;
  const skipped = submission.checklist.filter((c) => !c.checked).map((c) => c.text);
  const approveHint = x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const needsWorkHint = x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  return (
    <View>
      {/* What the swipe will do, revealed under the card. */}
      <View style={[StyleSheet.absoluteFill, styles.under]}>
        <Animated.View style={[styles.hint, { opacity: approveHint }]}>
          <AppText variant="bodyStrong" color={colors.success}>
            ✓ Approve
          </AppText>
        </Animated.View>
        <Animated.View style={[styles.hint, { opacity: needsWorkHint, alignItems: "flex-end" }]}>
          <AppText variant="bodyStrong" color={colors.attention}>
            Needs work ‹
          </AppText>
        </Animated.View>
      </View>

      <Animated.View style={{ transform: [{ translateX: x }] }} {...responder.panHandlers}>
        <Card style={{ gap: spacing.md, opacity: busy ? 0.6 : 1 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${instance.choreName} by ${submission.submittedBy.displayName}, details`}
            onPress={tap(onOpen)}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
          >
            <Avatar
              name={submission.submittedBy.displayName}
              color={submission.submittedBy.avatarColor}
            />
            <View style={{ flex: 1, gap: spacing.xxs }}>
              <AppText variant="bodyStrong">{instance.choreName}</AppText>
              <AppText variant="caption" color={colors.textMuted}>
                {`${submission.submittedBy.displayName} · ${submittedAt(submission.submittedAt)}`}
              </AppText>
            </View>
          </Pressable>

          <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
            {total > 0 && (
              <Chip
                label={`${checked}/${total} STEPS`}
                color={checked === total ? colors.success : colors.attention}
              />
            )}
            {instance.isLate && <Chip label="LATE" color={colors.attention} filled />}
            {instance.rewardAmount > 0 && <Chip label={`REWARD ${instance.rewardAmount}`} />}
            {!item.batchEligible && <Chip label="REVIEW EACH" color={colors.info} />}
          </View>

          {skipped.length > 0 && (
            <AppText variant="caption" color={colors.textMuted}>
              {`Not checked: ${skipped.join(", ")}`}
            </AppText>
          )}

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button
              title="Approve"
              onPress={tap(onApprove)}
              loading={busy}
              style={{ flex: 1 }}
              accessibilityLabel={`Approve ${instance.choreName} by ${submission.submittedBy.displayName}`}
            />
            <Button
              title="Needs work"
              variant="secondary"
              onPress={tap(onNeedsWork)}
              disabled={busy}
              style={{ flex: 1 }}
            />
          </View>
        </Card>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  under: {
    flexDirection: "row",
    borderRadius: radii.card,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
  },
  hint: { flex: 1 },
});
