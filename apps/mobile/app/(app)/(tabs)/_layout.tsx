import { Tabs } from "expo-router";
import { FamilyIcon, MeIcon, TodayIcon } from "../../../src/components/icons";
import { colors, typography } from "../../../src/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        // Explicit line height and bar height: Inter's metrics otherwise clip the labels.
        tabBarLabelStyle: {
          fontFamily: typography.caption.fontFamily,
          fontSize: 12,
          lineHeight: 16,
          paddingBottom: 3, // room for descenders ("y" in Today/Family)
          overflow: "visible",
        },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 68, // React Navigation sizes the bar from `height`, not minHeight
          paddingTop: 6,
          paddingBottom: 10,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Today", tabBarIcon: ({ color }) => <TodayIcon color={color} /> }}
      />
      <Tabs.Screen
        name="family"
        options={{ title: "Family", tabBarIcon: ({ color }) => <FamilyIcon color={color} /> }}
      />
      <Tabs.Screen
        name="me"
        options={{ title: "Me", tabBarIcon: ({ color }) => <MeIcon color={color} /> }}
      />
    </Tabs>
  );
}
