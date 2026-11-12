/**
 * Today: what's due, grouped into Needs attention / To do / Waiting for
 * review / Done, with a progress ring for the day and a celebration on every
 * completed chore.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Instance } from "@tenara/contracts";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, View } from "react-native";
import { GradientHeader, ProgressRing } from "../../../src/components/brand";
import { Celebration } from "../../../src/components/Celebration";
import { Screen, errorMessage } from "../../../src/components/Screen";
import { AppText, Button, Card, ErrorText } from "../../../src/components/ui";
import { type CardAction, ChoreCard } from "../../../src/features/today/ChoreCard";
import { CompleteSheet } from "../../../src/features/today/CompleteSheet";
import {
  type Scope,
  buildSections,
  dayProgress,
  defaultScope,
} from "../../../src/features/today/sections";
import { rewardLabel } from "../../../src/features/rewards/format";
import { invalidateRewards, useRewards } from "../../../src/features/rewards/useRewards";
import {
  type News,
  levelLine,
  parseSeen,
  seenKey,
  seenNow,
  whatsNew,
} from "../../../src/features/progress/celebrate";
import { GoalBar } from "../../../src/features/progress/ProgressViews";
import { useProgress } from "../../../src/features/progress/useProgress";
import { kv } from "../../../src/lib/kv";
import { useApi, useFamily, useSession } from "../../../src/state/AppProvider";
import { colors, radii, spacing } from "../../../src/theme";

export default function Today() {
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const { familyId, membershipId, role } = useFamily();
  const [scope, setScope] = useState<Scope>("mine");
  const [completing, setCompleting] = useState<Instance | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);
  const gamify = useProgress();
  const showXp = gamify.enabled;
  // New badges and level-ups since this device last looked: celebrated once.
  const [news, setNews] = useState<News | null>(null);
  const mineProgress = gamify.mine;
  useEffect(() => {
    if (!mineProgress || membershipId === undefined || !showXp) return;
    let alive = true;
    void kv.get(seenKey(membershipId)).then((raw) => {
      if (!alive) return;
      const found = whatsNew(mineProgress, parseSeen(raw));
      if (found.level !== undefined || found.badges.length > 0) {
        setNews(found);
        setBurst((n) => n + 1);
      }
      void kv.set(seenKey(membershipId), JSON.stringify(seenNow(mineProgress)));
    });
    return () => {
      alive = false;
    };
  }, [mineProgress, membershipId, showXp]);

  useEffect(() => {
    if (role) setScope(defaultScope(role));
  }, [role]);

  const agendaKey = ["agenda", familyId];
  const agenda = useQuery({
    queryKey: agendaKey,
    queryFn: () => api.agenda(familyId!),
    enabled: familyId !== undefined,
    refetchInterval: 60_000,
  });
  const rewards = useRewards();
  // Open jobs this person could take: extra work for extra rewards.
  const jobBoard = useQuery({
    queryKey: ["jobBoard", familyId],
    queryFn: () => api.jobBoard(familyId!),
    enabled: familyId !== undefined,
    refetchInterval: 60_000,
  });
  const jobs = jobBoard.data?.items ?? [];
  const rewardText = (item: Instance) =>
    rewards.format && item.rewardAmount > 0
      ? rewardLabel(rewards.format, item.rewardAmount)
      : undefined;
  const refresh = () => {
    invalidateRewards(queryClient, familyId);
    return queryClient.invalidateQueries({ queryKey: agendaKey });
  };

  const act = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: "start" | "defer" | "reset" | "claim" | "release";
    }) => api.act(familyId!, id, action),
    onSettled: () => {
      setBusyId(null);
      void refresh();
    },
  });

  const submit = useMutation({
    mutationFn: ({
      item,
      checked,
      photoUploadIds = [],
    }: {
      item: Instance;
      checked: Record<string, boolean>;
      photoUploadIds?: string[];
    }) =>
      api.submit(
        familyId!,
        item.id,
        item.checklist.map((step) => ({ itemId: step.id, checked: checked[step.id] ?? false })),
        photoUploadIds,
      ),
    onSuccess: () => {
      setCompleting(null);
      setBurst((n) => n + 1); // celebrate!
    },
    onSettled: () => {
      setBusyId(null);
      void refresh();
    },
  });

  const onAction = (item: Instance, action: CardAction) => {
    if (action === "complete") {
      submit.reset();
      // A checklist or a required photo needs the sheet; otherwise one tap is enough.
      // (A parent completing needs no photo, per the API's rules.)
      const needsPhoto = item.requiresPhoto && role !== "PARENT";
      if (item.checklist.length > 0 || needsPhoto) setCompleting(item);
      else {
        setBusyId(item.id);
        submit.mutate({ item, checked: {} });
      }
      return;
    }
    setBusyId(item.id);
    act.mutate({ id: item.id, action });
  };

  const sections = useMemo(
    () =>
      buildSections(agenda.data?.items ?? [], { viewerMembershipId: membershipId ?? "", scope }),
    [agenda.data, membershipId, scope],
  );
  const progress = dayProgress(sections);
  const today = new Date().toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <View style={{ flex: 1 }}>
      <Screen
        refreshControl={
          <RefreshControl refreshing={agenda.isRefetching} onRefresh={() => void refresh()} />
        }
        header={
          <GradientHeader>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg }}>
              <View style={{ flex: 1, gap: spacing.xs }}>
                <AppText variant="h1" color="#FFFFFF" accessibilityRole="header">
                  {`Hi ${session?.user.displayName ?? ""}!`}
                </AppText>
                <AppText color="#FFFFFF">{today}</AppText>
                <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
                  {rewards.format && rewards.mine && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`My rewards: ${rewards.format(rewards.mine.balance)}`}
                      onPress={() => router.push("/rewards")}
                      style={{
                        alignSelf: "flex-start",
                        backgroundColor: "rgba(255,255,255,0.2)",
                        borderRadius: radii.pill,
                        paddingVertical: spacing.xs,
                        paddingHorizontal: spacing.md,
                      }}
                    >
                      <AppText variant="bodyStrong" color="#FFFFFF">
                        {`${rewards.format(rewards.mine.balance)} ›`}
                      </AppText>
                    </Pressable>
                  )}
                  {showXp && gamify.mine && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`My progress: ${levelLine(gamify.mine)}`}
                      onPress={() => router.push("/rewards")}
                      style={{
                        alignSelf: "flex-start",
                        backgroundColor: "rgba(255,255,255,0.2)",
                        borderRadius: radii.pill,
                        paddingVertical: spacing.xs,
                        paddingHorizontal: spacing.md,
                      }}
                    >
                      <AppText variant="bodyStrong" color="#FFFFFF">
                        {levelLine(gamify.mine)}
                      </AppText>
                    </Pressable>
                  )}
                </View>
              </View>
              <ProgressRing done={progress.done} total={progress.total} />
            </View>
            <ScopeToggle scope={scope} onChange={setScope} />
          </GradientHeader>
        }
      >
        <ErrorText
          message={errorMessage(agenda.error ?? act.error ?? (completing ? null : submit.error))}
        />
        {news && (
          <Card style={{ gap: spacing.sm, borderColor: colors.primary }}>
            {news.level !== undefined && (
              <AppText variant="h2">{`🎉 Level ${news.level}!`}</AppText>
            )}
            {news.badges.map((label) => (
              <AppText key={label} variant="bodyStrong">{`🏅 New badge: ${label}`}</AppText>
            ))}
            <Button title="Nice!" variant="ghost" onPress={() => setNews(null)} />
          </Card>
        )}
        {showXp && gamify.goal && <GoalBar goal={gamify.goal} />}
        {agenda.isSuccess && sections.length === 0 && jobs.length === 0 && (
          <Card style={{ alignItems: "center", gap: spacing.sm }}>
            <AppText variant="h2">All clear!</AppText>
            <AppText color={colors.textMuted} style={{ textAlign: "center" }}>
              {scope === "mine" ? "Nothing on your list today." : "No chores for anyone today."}
            </AppText>
          </Card>
        )}
        {sections.map((section) => (
          <View key={section.key} style={{ gap: spacing.md }}>
            <AppText
              variant="bodyStrong"
              color={section.key === "attention" ? colors.attention : colors.textMuted}
              accessibilityRole="header"
            >
              {`${section.title} · ${section.items.length}`}
            </AppText>
            {section.items.map((item) => (
              <ChoreCard
                key={item.id}
                item={item}
                showAssignees={scope === "family"}
                busy={busyId === item.id}
                rewardText={rewardText(item)}
                xpText={showXp ? `+${item.xp} XP` : undefined}
                onAction={(action) => onAction(item, action)}
                onOpen={() => router.push({ pathname: "/chore/[id]", params: { id: item.id } })}
              />
            ))}
          </View>
        ))}
        {jobs.length > 0 && (
          <View style={{ gap: spacing.md }}>
            <View style={{ gap: spacing.xxs }}>
              <AppText variant="bodyStrong" color={colors.info} accessibilityRole="header">
                {`Job board · ${jobs.length}`}
              </AppText>
              <AppText variant="caption" color={colors.textMuted}>
                Extra jobs anyone can take. First to claim it does it.
              </AppText>
            </View>
            {jobs.map((item) => (
              <ChoreCard
                key={item.id}
                item={item}
                showAssignees={false}
                busy={busyId === item.id}
                rewardText={rewardText(item)}
                xpText={showXp ? `+${item.xp} XP` : undefined}
                onAction={(action) => onAction(item, action)}
                onOpen={() => router.push({ pathname: "/chore/[id]", params: { id: item.id } })}
              />
            ))}
          </View>
        )}
      </Screen>

      <CompleteSheet
        item={completing}
        photoRequired={completing?.requiresPhoto === true && role !== "PARENT"}
        submitting={submit.isPending}
        error={completing ? errorMessage(submit.error) : null}
        onSubmit={(checked, photoUploadIds) =>
          completing && submit.mutate({ item: completing, checked, photoUploadIds })
        }
        onClose={() => setCompleting(null)}
      />
      <Celebration burstKey={burst} />
    </View>
  );
}

function ScopeToggle({ scope, onChange }: { scope: Scope; onChange: (s: Scope) => void }) {
  const options: { value: Scope; label: string }[] = [
    { value: "mine", label: "Mine" },
    { value: "family", label: "Family" },
  ];
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        backgroundColor: "rgba(255,255,255,0.2)",
        borderRadius: radii.pill,
        padding: 3,
        alignSelf: "flex-start",
      }}
    >
      {options.map((o) => {
        const active = scope === o.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={{
              paddingVertical: spacing.xs,
              paddingHorizontal: spacing.lg,
              borderRadius: radii.pill,
              backgroundColor: active ? "#FFFFFF" : "transparent",
            }}
          >
            <AppText variant="bodyStrong" color={active ? colors.primary : "#FFFFFF"}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
