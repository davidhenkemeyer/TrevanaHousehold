/**
 * Tabs. Everyone: Today, Family, Me. Parents also get Review (with a badge
 * counting what's waiting) and Chores. Hiding a tab is only a convenience:
 * the API still refuses parent-only requests from a kid.
 */
import { useQuery } from "@tanstack/react-query";
import { Tabs } from "expo-router";
import {
  ChoresIcon,
  FamilyIcon,
  MeIcon,
  ReviewIcon,
  TodayIcon,
} from "../../../src/components/icons";
import { useUnreadCount } from "../../../src/features/notifications/usePush";
import { useRedemptionRequests } from "../../../src/features/rewards/RedemptionRequests";
import { useApi, useFamily } from "../../../src/state/AppProvider";
import { colors, typography } from "../../../src/theme";

export default function TabsLayout() {
  const api = useApi();
  const { familyId, role } = useFamily();
  const isParent = role === "PARENT";
  // Shares the queue's key prefix, so every review decision refreshes the badge too.
  const waiting = useQuery({
    queryKey: ["reviewQueue", familyId, "count"],
    queryFn: () => api.reviewQueue(familyId!),
    select: (q) => q.total,
    enabled: familyId !== undefined && isParent,
    refetchInterval: 60_000,
  });
  // Chores to review plus requests to spend points: everything waiting on a parent.
  const requests = useRedemptionRequests(isParent).data?.length ?? 0;
  const count = (waiting.data ?? 0) + requests;
  const badge = isParent && count > 0 ? count : undefined;
  const unread = useUnreadCount();

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
        tabBarBadgeStyle: { backgroundColor: colors.attention, color: colors.onPrimary },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Today", tabBarIcon: ({ color }) => <TodayIcon color={color} /> }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: "Review",
          tabBarIcon: ({ color }) => <ReviewIcon color={color} />,
          tabBarBadge: badge,
          href: isParent ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="chores"
        options={{
          title: "Chores",
          tabBarIcon: ({ color }) => <ChoresIcon color={color} />,
          href: isParent ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="family"
        options={{ title: "Family", tabBarIcon: ({ color }) => <FamilyIcon color={color} /> }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: "Me",
          tabBarIcon: ({ color }) => <MeIcon color={color} />,
          tabBarBadge: unread > 0 ? unread : undefined,
        }}
      />
    </Tabs>
  );
}
