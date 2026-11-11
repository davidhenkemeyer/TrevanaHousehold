/** The family's progress (XP, levels, streaks, badges, goal) and the viewer's own row. */
import { useQuery } from "@tanstack/react-query";
import { useApi, useFamily } from "../../state/AppProvider";

export function useProgress() {
  const api = useApi();
  const { familyId, membershipId, family } = useFamily();
  const query = useQuery({
    queryKey: ["progress", familyId],
    queryFn: () => api.progress(familyId!),
    enabled: familyId !== undefined,
    refetchInterval: 60_000,
  });
  return {
    query,
    /** Whether the family shows XP and badges (defaults to on while loading). */
    enabled: family.data?.family.gamification ?? true,
    mine: query.data?.members.find((m) => m.member.membershipId === membershipId),
    goal: query.data?.goal ?? null,
  };
}
