/**
 * Brand pieces: the gradient header, the Titan "T" mark, and the progress ring
 * (the Household icon's co-op ring, reused to show the day's progress).
 */
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { View } from "react-native";
import Svg, { Circle, G, Rect } from "react-native-svg";
import { colors, spacing } from "../theme";
import { AppText } from "./ui";

export function GradientHeader({ children }: { children: ReactNode }) {
  return (
    <LinearGradient
      colors={colors.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }} // 135°, as in the icon
      style={{ padding: spacing.xl, paddingTop: spacing.xxl, gap: spacing.sm }}
    >
      {children}
    </LinearGradient>
  );
}

/** The signed-out screens' header: mark, app name, and a line of context. */
export function BrandHeader({ subtitle }: { subtitle: string }) {
  return (
    <GradientHeader>
      <TitanMark size={64} />
      <AppText variant="display" color="#FFFFFF" accessibilityRole="header">
        Titan Household
      </AppText>
      <AppText color="#FFFFFF">{subtitle}</AppText>
    </GradientHeader>
  );
}

/** The geometric "T" in a gear, in white (for use on the gradient). */
export function TitanMark({ size = 56 }: { size?: number }) {
  const teeth = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512" accessibilityLabel="Titan Household">
      <G fill="#FFFFFF">
        {teeth.map((angle) => (
          <Rect
            key={angle}
            x={241}
            y={130}
            width={30}
            height={36}
            rx={7}
            rotation={angle}
            origin="256, 256"
          />
        ))}
      </G>
      <Circle
        cx={256}
        cy={256}
        r={100}
        fill="#FFFFFF"
        fillOpacity={0.14}
        stroke="#FFFFFF"
        strokeWidth={20}
      />
      <G fill="#FFFFFF">
        <Rect x={200} y={206} width={112} height={28} rx={6} />
        <Rect x={242} y={206} width={28} height={100} rx={6} />
      </G>
    </Svg>
  );
}

/** Progress ring with a count in the middle, e.g. 2 of 5 chores done. */
export function ProgressRing({
  done,
  total,
  size = 72,
  color = "#FFFFFF",
}: {
  done: number;
  total: number;
  size?: number;
  color?: string;
}) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const fraction = total === 0 ? 0 : Math.min(1, done / total);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`${done} of ${total} done`}
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
    >
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeOpacity={0.3}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference * fraction} ${circumference}`}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <AppText variant="mono" color={color}>
        {`${done}/${total}`}
      </AppText>
    </View>
  );
}
