/**
 * One chore on the Today view. Buttons come straight from the instance's
 * `availableActions` (computed by the API from the domain rules), so the app
 * never decides on its own what someone may do.
 */
import type { Instance } from "@titan/contracts";
import { Pressable, View } from "react-native";
import { AppText, Avatar, Button, Card, Chip } from "../../components/ui";
import { colors, spacing } from "../../theme";

import { dueLabel } from "./sections";

export type CardAction = "start" | "defer" | "reset" | "complete";

export function ChoreCard({
  item,
  showAssignees,
  busy,
  onAction,
  onOpen,
}: {
  item: Instance;
  showAssignees: boolean;
  busy: boolean;
  onAction: (action: CardAction) => void;
  onOpen: () => void;
}) {
  const can = (a: CardAction) => item.availableActions.includes(a);
  const steps = item.checklist.length;

  return (
    <Card style={{ gap: spacing.md }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.choreName}`}
        onPress={onOpen}
        style={{ gap: spacing.xs }}
      >
        {item.cue && (
          <AppText variant="caption" color={colors.info}>
            {`When: ${item.cue}`}
          </AppText>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <AppText variant="h2" style={{ flex: 1 }} numberOfLines={2}>
            {item.choreName}
          </AppText>
          {showAssignees &&
            item.assignees.map((a) => (
              <Avatar key={a.membershipId} name={a.displayName} color={a.avatarColor} size={28} />
            ))}
        </View>
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" }}
        >
          <AppText variant="caption" color={item.isLate ? colors.attention : colors.textMuted}>
            {dueLabel(item.dueAt)}
          </AppText>
          {item.isLate && <Chip label="LATE" color={colors.attention} filled />}
          {item.status === "NEEDS_REWORK" && (
            <Chip label="TRY AGAIN" color={colors.attention} filled />
          )}
          {item.status === "IN_PROGRESS" && <Chip label="IN PROGRESS" color={colors.info} />}
          {item.status === "DEFERRED" && <Chip label="LATER" color={colors.textMuted} />}
          {steps > 0 && <Chip label={`${steps} ${steps === 1 ? "STEP" : "STEPS"}`} />}
          {item.rewardAmount > 0 && <Chip label={`+${item.rewardAmount}`} color={colors.success} />}
        </View>
      </Pressable>

      {item.status === "NEEDS_REWORK" && item.latestReview?.note && (
        <View
          style={{ backgroundColor: `${colors.attention}14`, borderRadius: 8, padding: spacing.md }}
        >
          <AppText variant="caption" color={colors.textMuted}>
            {`${item.latestReview.reviewer?.displayName ?? "A parent"} says:`}
          </AppText>
          <AppText>{item.latestReview.note}</AppText>
        </View>
      )}

      {(can("complete") || can("start") || can("defer") || can("reset")) && (
        <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
          {can("complete") && (
            <Button
              title="Done ✓"
              onPress={() => onAction("complete")}
              loading={busy}
              style={{ flexGrow: 1 }}
            />
          )}
          {can("start") && item.status !== "NEEDS_REWORK" && (
            <Button
              title="Start"
              variant="secondary"
              onPress={() => onAction("start")}
              disabled={busy}
            />
          )}
          {can("defer") && (
            <Button
              title="Later"
              variant="ghost"
              onPress={() => onAction("defer")}
              disabled={busy}
            />
          )}
          {can("reset") && item.status === "IN_PROGRESS" && (
            <Button
              title="Stop"
              variant="ghost"
              onPress={() => onAction("reset")}
              disabled={busy}
            />
          )}
        </View>
      )}
    </Card>
  );
}
