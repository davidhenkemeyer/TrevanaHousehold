/**
 * Progress building blocks: the family goal bar, a level card with its XP
 * bar and streak, and the badge grid (earned in color, the rest greyed with
 * what it takes to earn them).
 */
import type { BadgeDefinition, FamilyGoal, MemberProgress } from "@titan/contracts";
import { StyleSheet, View } from "react-native";
import { AppText, Card } from "../../components/ui";
import { colors, radii, spacing } from "../../theme";

const ICONS: Record<BadgeDefinition["icon"], string> = {
  star: "⭐",
  trophy: "🏆",
  flame: "🔥",
  calendar: "📅",
  target: "🎯",
  medal: "🏅",
  hand: "🤝",
};

function Bar({ fraction, color = colors.primary }: { fraction: number; color?: string }) {
  return (
    <View style={styles.track}>
      <View
        style={[
          styles.fill,
          {
            width: `${Math.round(Math.min(Math.max(fraction, 0), 1) * 100)}%`,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
}

export function GoalBar({ goal }: { goal: FamilyGoal }) {
  const reached = goal.reachedAt !== null;
  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <AppText variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
          {reached ? `🎉 ${goal.name}: reached!` : goal.name}
        </AppText>
        <AppText variant="mono" color={colors.textMuted}>
          {`${Math.min(goal.progressXp, goal.targetXp)} / ${goal.targetXp} XP`}
        </AppText>
      </View>
      <Bar fraction={goal.percent / 100} color={reached ? colors.success : colors.info} />
      <AppText variant="caption" color={colors.textMuted}>
        {reached
          ? "The whole family did it together."
          : "Everyone's XP counts toward this. Building Habits, Together."}
      </AppText>
    </Card>
  );
}

export function LevelCard({ progress }: { progress: MemberProgress }) {
  const { streak } = progress;
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm }}>
        <AppText variant="h1" style={{ flex: 1 }}>{`Level ${progress.level}`}</AppText>
        <AppText variant="mono" color={colors.textMuted}>{`${progress.xp} XP`}</AppText>
      </View>
      <Bar fraction={progress.xpIntoLevel / progress.xpForNextLevel} />
      <AppText variant="caption" color={colors.textMuted}>
        {`${progress.xpForNextLevel - progress.xpIntoLevel} XP to level ${progress.level + 1}`}
      </AppText>
      <View style={{ flexDirection: "row", gap: spacing.lg, flexWrap: "wrap" }}>
        <View>
          <AppText variant="bodyStrong">{`🔥 ${streak.days}-day streak`}</AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {`Best: ${streak.best} ${streak.best === 1 ? "day" : "days"}`}
          </AppText>
        </View>
        <View>
          <AppText variant="bodyStrong">{`🛟 ${streak.saves} ${streak.saves === 1 ? "save" : "saves"}`}</AppText>
          <AppText variant="caption" color={colors.textMuted}>
            Every 7 days earns one; a missed day uses it.
          </AppText>
        </View>
      </View>
    </Card>
  );
}

export function BadgeGrid({
  earned,
  all,
}: {
  earned: MemberProgress["badges"];
  all: readonly BadgeDefinition[];
}) {
  const earnedKeys = new Set(earned.map((b) => b.key));
  // Earned first (newest first), then the ones still to aim for.
  const toEarn = all.filter(
    (b) =>
      !earnedKeys.has(b.key) &&
      !(b.key === "MASTERY:" && earned.some((e) => e.key.startsWith("MASTERY:"))),
  );
  const tiles = [
    ...earned.map((b) => ({ ...b, earned: true })),
    ...toEarn.map((b) => ({ ...b, earned: false })),
  ];
  return (
    <View style={styles.grid}>
      {tiles.map((b) => (
        <View
          key={b.key}
          accessibilityLabel={`${b.label}${b.earned ? ", earned" : `: ${b.description}`}`}
          style={[styles.badge, !b.earned && styles.badgeLocked]}
        >
          <AppText variant="h1" style={!b.earned && { opacity: 0.35 }}>
            {ICONS[b.icon]}
          </AppText>
          <AppText variant="caption" style={{ textAlign: "center" }} numberOfLines={2}>
            {b.label}
          </AppText>
          {!b.earned && (
            <AppText
              variant="caption"
              color={colors.textMuted}
              style={{ textAlign: "center" }}
              numberOfLines={4}
            >
              {b.description}
            </AppText>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: radii.pill },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  badge: {
    width: 104,
    minHeight: 104,
    padding: spacing.sm,
    gap: spacing.xxs,
    alignItems: "center",
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeLocked: { backgroundColor: colors.background },
});
