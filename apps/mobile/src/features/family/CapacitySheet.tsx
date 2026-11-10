/**
 * "Daily time": how many minutes of chores a member can do on each weekday
 * (0 = a day off). The planner uses it to spread chores fairly, so young kids
 * get less and parents more. Saving re-plans chores nobody has started yet.
 */
import type { Member } from "@titan/contracts";
import type { WeeklyCapacity } from "@titan/domain";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { FieldLabel, SelectChip, Sheet, Stepper } from "../../components/forms";
import { AppText, Button, ErrorText } from "../../components/ui";
import { colors, spacing } from "../../theme";
import {
  CAPACITY_MAX,
  CAPACITY_PRESETS,
  WEEKDAYS_MONDAY_FIRST,
  capacityFromPreset,
  formatMinutes,
  stepCapacity,
  weeklyTotal,
} from "../week/week";

export function CapacitySheet({
  member,
  saving,
  error,
  onSave,
  onClose,
}: {
  member: Member | null;
  saving: boolean;
  error: string | null;
  onSave: (capacity: WeeklyCapacity) => void;
  onClose: () => void;
}) {
  const [capacity, setCapacity] = useState<WeeklyCapacity | null>(null);
  useEffect(() => setCapacity(member ? { ...member.capacity } : null), [member]);
  if (!member || !capacity) return null;

  const matches = (weekday: number, weekend: number) =>
    WEEKDAYS_MONDAY_FIRST.every(
      ({ key }) => capacity[key] === (key === "sat" || key === "sun" ? weekend : weekday),
    );

  return (
    <Sheet visible onClose={onClose}>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="h2">{`${member.displayName}'s daily time`}</AppText>
        <AppText color={colors.textMuted}>
          Minutes of chores they can do each day. Set 0 for days off.
        </AppText>
      </View>
      <FieldLabel>Start from</FieldLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {CAPACITY_PRESETS.map((p) => (
          <SelectChip
            key={p.label}
            label={`${p.label} (${p.weekday}/${p.weekend})`}
            accessibilityLabel={`${p.label}: ${p.weekday} minutes on weekdays, ${p.weekend} on weekends`}
            selected={matches(p.weekday, p.weekend)}
            onPress={() => setCapacity(capacityFromPreset(p.weekday, p.weekend))}
          />
        ))}
      </View>
      <View>
        {WEEKDAYS_MONDAY_FIRST.map(({ key, label }) => (
          <Stepper
            key={key}
            label={label}
            display={capacity[key] === 0 ? "Day off" : `${capacity[key]} min`}
            onDecrement={() => setCapacity({ ...capacity, [key]: stepCapacity(capacity[key], -1) })}
            onIncrement={() => setCapacity({ ...capacity, [key]: stepCapacity(capacity[key], 1) })}
            canDecrement={capacity[key] > 0}
            canIncrement={capacity[key] < CAPACITY_MAX}
          />
        ))}
      </View>
      <AppText variant="mono" color={colors.textMuted}>
        {`${formatMinutes(weeklyTotal(capacity))} a week`}
      </AppText>
      <ErrorText message={error} />
      <Button title="Save" onPress={() => onSave(capacity)} loading={saving} />
      <Button title="Cancel" variant="ghost" onPress={onClose} disabled={saving} />
    </Sheet>
  );
}
