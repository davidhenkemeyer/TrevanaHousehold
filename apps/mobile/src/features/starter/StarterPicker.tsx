/**
 * The starter chore list as tick boxes, one card per room. Used by the
 * "Add from the starter list" screen and by first-time setup.
 */
import type { StarterRoom } from "@tenara/contracts";
import { View } from "react-native";
import { Section } from "../../components/forms";
import { AppText, Checkbox, Chip } from "../../components/ui";
import { colors, spacing } from "../../theme";

export function StarterPicker({
  rooms,
  selected,
  onToggle,
}: {
  rooms: readonly StarterRoom[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <>
      {rooms.map((room) => (
        <Section key={room.room} title={room.label}>
          {room.chores.map((c) => (
            <View key={c.id} style={{ gap: spacing.xxs }}>
              {c.added ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <AppText color={colors.textMuted} style={{ flex: 1 }}>
                    {c.name}
                  </AppText>
                  <Chip label="ADDED" />
                </View>
              ) : (
                <Checkbox
                  checked={selected.has(c.id)}
                  label={c.name}
                  onToggle={() => onToggle(c.id)}
                  mutedWhenChecked={false}
                />
              )}
              <AppText
                variant="caption"
                color={colors.textMuted}
                style={{ paddingLeft: 28 + spacing.md }}
              >
                {[c.howOften, `${c.effortMinutes} min`, c.minAgeLabel, c.cue]
                  .filter((part) => part !== null)
                  .join(" · ")}
              </AppText>
            </View>
          ))}
        </Section>
      ))}
    </>
  );
}
