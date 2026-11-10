/**
 * The parents' week view: one row per day, one column per member. Each cell
 * shows assigned vs. available chore minutes as a bar, in the warning color
 * when someone has more than they have time for. Tapping a cell lists that
 * member's chores for the day.
 */
import type { Member, WeekLoad } from "@titan/contracts";
import type { PlainDate } from "@titan/domain";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Avatar, Card } from "../../components/ui";
import { colors, radii, spacing } from "../../theme";
import { dayLabel, loadFraction } from "./week";

const DAY_COLUMN = 56;

export function WeekGrid({
  load,
  members,
  today,
  onSelect,
}: {
  load: WeekLoad;
  members: readonly Member[];
  /** Highlighted row. */
  today: string | undefined;
  onSelect: (date: PlainDate, member: Member) => void;
}) {
  const byId = new Map(members.map((m) => [m.id, m]));
  const columns = (load.days[0]?.members ?? [])
    .map((c) => byId.get(c.membershipId))
    .filter((m): m is Member => m !== undefined);

  return (
    <Card style={{ gap: spacing.sm, paddingHorizontal: spacing.md }}>
      <View style={styles.row}>
        <View style={{ width: DAY_COLUMN }} />
        {columns.map((m) => (
          <View key={m.id} style={styles.cell}>
            <Avatar name={m.displayName} color={m.avatarColor} size={28} />
            <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
              {m.displayName}
            </AppText>
          </View>
        ))}
      </View>

      {load.days.map((day) => (
        <View
          key={day.date}
          style={[styles.row, day.date === today && styles.todayRow]}
          accessibilityLabel={dayLabel(day.date)}
        >
          <AppText
            variant="bodyStrong"
            color={day.date === today ? colors.primary : colors.text}
            style={{ width: DAY_COLUMN }}
          >
            {dayLabel(day.date)}
          </AppText>
          {day.members.map((c) => {
            const member = byId.get(c.membershipId);
            if (!member) return null;
            const fill = loadFraction(c.assignedMinutes, c.capacityMinutes);
            const tone = c.overCapacity ? colors.attention : colors.success;
            return (
              <Pressable
                key={c.membershipId}
                accessibilityRole="button"
                accessibilityLabel={`${member.displayName}, ${dayLabel(day.date)}: ${c.assignedMinutes} of ${c.capacityMinutes} minutes${c.overCapacity ? ", over their time" : ""}`}
                onPress={() => onSelect(day.date, member)}
                style={({ pressed }) => [styles.cell, pressed && { opacity: 0.6 }]}
              >
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      { width: `${Math.round(fill * 100)}%`, backgroundColor: tone },
                    ]}
                  />
                </View>
                <AppText
                  variant="mono"
                  color={c.overCapacity ? colors.attention : colors.textMuted}
                  numberOfLines={1}
                >
                  {`${c.assignedMinutes}/${c.capacityMinutes}`}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      ))}
      <AppText variant="caption" color={colors.textMuted}>
        Minutes of chores / minutes they have that day.
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: 44 },
  todayRow: { backgroundColor: colors.background, borderRadius: radii.button },
  cell: { flex: 1, alignItems: "center", gap: spacing.xxs, paddingVertical: spacing.xs },
  track: {
    width: "80%",
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: radii.pill },
});
