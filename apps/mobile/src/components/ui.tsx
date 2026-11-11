/**
 * The app's building blocks, styled from the Titan tokens (Branding Suite §7.4):
 * buttons (8 px radius; primary / secondary / ghost), cards (12 px radius,
 * 16 px padding, soft shadow, 1 px border), pill badges in monospace, and
 * text in the Titan type scale. Screens compose these instead of styling
 * from scratch, so the look stays consistent.
 */
import { type ReactNode, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import { cardShadow, colors, interaction, radii, spacing, typography } from "../theme";

type Variant = keyof typeof typography;

export function AppText({
  variant = "body",
  color = colors.text,
  style,
  children,
  ...rest
}: {
  variant?: Variant;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
  accessibilityRole?: "header" | "text";
  /** What a screen reader says instead of the text (e.g. "Balance: $5.00"). */
  accessibilityLabel?: string;
  /** Lets people copy the text (codes, invite tokens). */
  selectable?: boolean;
}) {
  return (
    <Text style={[typography[variant], { color }, style]} {...rest}>
      {children}
    </Text>
  );
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  style,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const inactive = disabled || loading;
  const textColor = variant === "primary" ? colors.onPrimary : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.button,
        variant === "primary" && { backgroundColor: colors.primary },
        variant === "secondary" && styles.secondary,
        variant === "ghost" && hovered && styles.ghostHover,
        pressed && { transform: [{ scale: interaction.pressedScale }] },
        inactive && styles.inactive,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <AppText variant="bodyStrong" color={textColor}>
          {title}
        </AppText>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Pill-shaped badge in monospace (§7.4), e.g. "2/3", "+50 XP", "LATE". */
export function Chip({
  label,
  color = colors.textMuted,
  filled = false,
}: {
  label: string;
  color?: string;
  filled?: boolean;
}) {
  return (
    <View style={[styles.chip, { borderColor: color }, filled && { backgroundColor: color }]}>
      <AppText variant="mono" color={filled ? colors.onPrimary : color}>
        {label}
      </AppText>
    </View>
  );
}

export function Avatar({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  return (
    <View
      accessibilityLabel={name}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={[
          typography.bodyStrong,
          { color: colors.onPrimary, fontSize: size * 0.42, lineHeight: size * 0.5 },
        ]}
      >
        {name.trim().charAt(0).toUpperCase() || "?"}
      </Text>
    </View>
  );
}

export function TextField({
  label,
  error,
  ...input
}: TextInputProps & { label: string; error?: string | undefined }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="caption" color={colors.textMuted}>
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        {...input}
        onFocus={(e) => {
          setFocused(true);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          input.onBlur?.(e);
        }}
        style={[
          styles.input,
          focused && { borderColor: colors.primary, borderWidth: interaction.focusRingWidth },
          error !== undefined && { borderColor: colors.danger },
        ]}
      />
      {error !== undefined && (
        <AppText variant="caption" color={colors.danger}>
          {error}
        </AppText>
      )}
    </View>
  );
}

export function Checkbox({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onToggle}
      style={styles.checkRow}
    >
      <View
        style={[
          styles.box,
          checked && { backgroundColor: colors.success, borderColor: colors.success },
        ]}
      >
        {checked && <Text style={styles.tick}>✓</Text>}
      </View>
      <AppText style={{ flex: 1 }} color={checked ? colors.textMuted : colors.text}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function ErrorText({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <View accessibilityRole="alert" style={styles.errorBox}>
      <AppText variant="caption" color={colors.danger}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.button,
    alignItems: "center",
    justifyContent: "center",
  },
  secondary: {
    borderWidth: interaction.buttonBorderWidth,
    borderColor: colors.primary,
    backgroundColor: "transparent",
  },
  ghostHover: { backgroundColor: `${colors.primary}1A` }, // 10% overlay
  inactive: { opacity: 0.5 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...cardShadow,
  },
  chip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    alignSelf: "flex-start",
  },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.button,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  box: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  tick: { color: colors.onPrimary, fontSize: 16, fontFamily: typography.bodyStrong.fontFamily },
  errorBox: {
    backgroundColor: `${colors.danger}12`,
    borderRadius: radii.button,
    padding: spacing.md,
  },
});
