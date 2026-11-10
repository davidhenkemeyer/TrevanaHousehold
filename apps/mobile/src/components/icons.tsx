/** Simple line icons for the tab bar, drawn with react-native-svg. */
import type { ColorValue } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

type IconProps = { color: ColorValue; size?: number };

export function TodayIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M8 12.5l2.5 2.5L16 9.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function FamilyIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Circle cx={9} cy={8} r={3} />
      <Circle cx={17} cy={9.5} r={2.5} />
      <Path
        d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M15 14.2c2.9-.3 5 1.5 5 4.3"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function MeIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" strokeLinecap="round" />
    </Svg>
  );
}
