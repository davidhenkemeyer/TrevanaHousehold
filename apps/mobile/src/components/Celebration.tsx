/**
 * The completion celebration (branding doc: immediate visual + haptic
 * feedback): a short burst of confetti in the brand colors and a success tap.
 * Uses React Native's built-in Animated, so it works the same on the web.
 */
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef } from "react";
import { Animated, Dimensions, Easing, Platform, StyleSheet, View } from "react-native";
import { accents } from "@titan/tokens";

const PIECES = 36;
const COLORS = [
  accents.household.amber,
  accents.household.emerald,
  accents.household.sky,
  "#F59E0B",
];

export function Celebration({ burstKey, onDone }: { burstKey: number; onDone?: () => void }) {
  const progress = useRef(new Animated.Value(0)).current;
  const { width, height } = Dimensions.get("window");

  // New random layout for each burst.
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        key: `${burstKey}-${i}`,
        x: Math.random() * width,
        drift: (Math.random() - 0.5) * 160,
        size: 6 + Math.random() * 8,
        spin: (Math.random() - 0.5) * 720,
        color: COLORS[i % COLORS.length] as string,
        delay: Math.random() * 0.25,
      })),
    [burstKey, width],
  );

  useEffect(() => {
    if (burstKey === 0) return;
    if (Platform.OS !== "web") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 1400,
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start(() => onDone?.());
    return () => animation.stop();
  }, [burstKey, progress, onDone]);

  if (burstKey === 0) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden>
      {pieces.map((p) => {
        const t = progress.interpolate({
          inputRange: [p.delay, 1],
          outputRange: [0, 1],
          extrapolate: "clamp",
        });
        return (
          <Animated.View
            key={p.key}
            style={{
              position: "absolute",
              left: p.x,
              top: -20,
              width: p.size,
              height: p.size * 0.6,
              borderRadius: 2,
              backgroundColor: p.color,
              opacity: progress.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
              transform: [
                {
                  translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.7] }),
                },
                { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
                {
                  rotate: t.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0deg", `${p.spin}deg`],
                  }),
                },
              ],
            }}
          />
        );
      })}
    </View>
  );
}
