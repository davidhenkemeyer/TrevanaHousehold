/**
 * Form building blocks for the parent tools: segmented controls, selectable
 * chips, steppers, toggles, sections, and a bottom sheet. Styled from the
 * Tenara tokens like the rest of `components/`; every control is a real
 * button/switch for screen readers and works with a mouse on the web.
 */
import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { colors, interaction, radii, spacing } from "../theme";
import { AppText, Card } from "./ui";

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ gap: spacing.xxs }}>
        <AppText variant="h2" accessibilityRole="header">
          {title}
        </AppText>
        {hint !== undefined && (
          <AppText variant="caption" color={colors.textMuted}>
            {hint}
          </AppText>
        )}
      </View>
      {children}
    </Card>
  );
}

/** A small caption above a control. */
export function FieldLabel({ children }: { children: string }) {
  return (
    <AppText variant="caption" color={colors.textMuted}>
      {children}
    </AppText>
  );
}

export function FieldError({ message }: { message: string | undefined }) {
  if (message === undefined) return null;
  return (
    <AppText variant="caption" color={colors.danger} accessibilityRole="text">
      {message}
    </AppText>
  );
}

/** One pill that can be on or off (single- or multi-select groups are built from these). */
export function SelectChip({
  label,
  selected,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      // Also as an ARIA attribute: the web drops accessibilityState.selected on buttons.
      aria-selected={selected}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && { transform: [{ scale: interaction.pressedScale }] },
      ]}
    >
      <AppText variant="bodyStrong" color={selected ? colors.onPrimary : colors.text}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** A wrapping row of single-choice chips. */
export function ChoiceChips<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.wrapRow}>
      {options.map((o) => (
        <SelectChip
          key={String(o.value)}
          label={o.label}
          selected={o.value === value}
          onPress={() => onChange(o.value)}
        />
      ))}
    </View>
  );
}

/** Two or three mutually exclusive views, e.g. "Chores | Week". */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            // Also as an ARIA attribute: the web drops accessibilityState.selected on buttons.
            aria-selected={selected}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <AppText variant="bodyStrong" color={selected ? colors.text : colors.textMuted}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** "−  20 min  +" with a label; the buttons disable at the limits. */
export function Stepper({
  label,
  display,
  onDecrement,
  onIncrement,
  canDecrement = true,
  canIncrement = true,
}: {
  label: string;
  display: string;
  onDecrement: () => void;
  onIncrement: () => void;
  canDecrement?: boolean;
  canIncrement?: boolean;
}) {
  return (
    <View style={styles.stepperRow}>
      <AppText style={{ flex: 1 }}>{label}</AppText>
      <StepButton
        symbol="−"
        label={`Less ${label}`}
        onPress={onDecrement}
        disabled={!canDecrement}
      />
      <AppText variant="mono" style={styles.stepperValue}>
        {display}
      </AppText>
      <StepButton
        symbol="+"
        label={`More ${label}`}
        onPress={onIncrement}
        disabled={!canIncrement}
      />
    </View>
  );
}

function StepButton({
  symbol,
  label,
  onPress,
  disabled,
}: {
  symbol: string;
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.stepButton,
        disabled && { opacity: 0.4 },
        pressed && { transform: [{ scale: interaction.pressedScale }] },
      ]}
    >
      <AppText variant="h2" color={colors.primary}>
        {symbol}
      </AppText>
    </Pressable>
  );
}

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.stepperRow}>
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <AppText>{label}</AppText>
        {hint !== undefined && (
          <AppText variant="caption" color={colors.textMuted}>
            {hint}
          </AppText>
        )}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.primary, false: colors.border }}
        thumbColor={colors.surface}
      />
    </View>
  );
}

/** A card that slides up from the bottom, over a dimmed screen. */
export function Sheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close" onPress={onClose} />
        <Card style={styles.sheet}>
          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ gap: spacing.lg }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </Card>
      </View>
    </Modal>
  );
}

/** "‹ Back" for screens with a gradient header. */
export function BackLink({ onPress, label = "Back" }: { onPress: () => void; label?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ alignSelf: "flex-start", paddingVertical: spacing.xs }}
    >
      <AppText variant="bodyStrong" color={colors.onPrimary}>
        {`‹ ${label}`}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmented: {
    flexDirection: "row",
    backgroundColor: colors.border,
    borderRadius: radii.button,
    padding: spacing.xxs,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.button - 2,
  },
  segmentSelected: { backgroundColor: colors.surface },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44 },
  stepperValue: { minWidth: 76, textAlign: "center" },
  stepButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  scrim: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15, 23, 42, 0.5)" },
  sheet: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    maxHeight: "85%",
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
});
