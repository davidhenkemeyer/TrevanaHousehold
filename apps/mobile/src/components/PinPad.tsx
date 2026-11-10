/**
 * Big-button PIN entry, friendly for small kids. PINs are 4–6 digits, so the
 * user confirms with ✓ once at least 4 are entered.
 */
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { colors, radii, spacing } from "../theme";
import { AppText } from "./ui";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✓"] as const;

export function PinPad({
  onSubmit,
  disabled = false,
}: {
  onSubmit: (pin: string) => void;
  disabled?: boolean;
}) {
  const [pin, setPin] = useState("");

  const press = (key: (typeof KEYS)[number]) => {
    if (disabled) return;
    if (key === "⌫") setPin((p) => p.slice(0, -1));
    else if (key === "✓") {
      if (pin.length >= 4) {
        onSubmit(pin);
        setPin("");
      }
    } else if (pin.length < 6) setPin((p) => p + key);
  };

  return (
    <View style={{ gap: spacing.lg, alignItems: "center" }}>
      <View style={styles.dots} accessibilityLabel={`${pin.length} digits entered`}>
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <View
            key={i}
            style={[styles.dot, i < pin.length && { backgroundColor: colors.primary }]}
          />
        ))}
      </View>
      <View style={styles.grid}>
        {KEYS.map((key) => {
          const isSubmit = key === "✓";
          const enabled = isSubmit ? pin.length >= 4 && !disabled : !disabled;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={key === "⌫" ? "Delete" : isSubmit ? "Done" : key}
              accessibilityState={{ disabled: !enabled }}
              onPress={() => press(key)}
              style={({ pressed }) => [
                styles.key,
                isSubmit && { backgroundColor: enabled ? colors.primary : colors.border },
                pressed && { transform: [{ scale: 0.95 }] },
              ]}
            >
              <AppText variant="h1" color={isSubmit ? colors.onPrimary : colors.text}>
                {key}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const KEY_SIZE = 72;
const styles = StyleSheet.create({
  dots: { flexDirection: "row", gap: spacing.md },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.primary },
  grid: {
    width: KEY_SIZE * 3 + spacing.lg * 2,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
  },
  key: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
});
