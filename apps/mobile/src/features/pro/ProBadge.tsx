/**
 * A small "PRO" tag next to a Pro feature the family doesn't have right now.
 * For parents it's a button to the Pro screen; kids just see the tag (they
 * never see purchase screens).
 */
import type { ProFeature } from "@tenara/domain";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import { Chip } from "../../components/ui";
import { useFamily } from "../../state/AppProvider";
import { colors } from "../../theme";

/** The family's plan, from the API. */
export function usePlan() {
  const { family } = useFamily();
  return family.data?.family.plan;
}

/** Whether the family has a Pro feature now (true while the plan is still loading). */
export function useHasFeature(feature: ProFeature): boolean {
  return usePlan()?.features[feature] ?? true;
}

/** Shown only when the family lacks the feature. */
export function ProBadge({ feature }: { feature: ProFeature }) {
  const router = useRouter();
  const { role } = useFamily();
  if (useHasFeature(feature)) return null;
  const chip = <Chip label="PRO" color={colors.attention} />;
  if (role !== "PARENT") return chip;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Part of Tenara Pro. See what Pro includes"
      onPress={() => router.push("/pro")}
    >
      {chip}
    </Pressable>
  );
}
