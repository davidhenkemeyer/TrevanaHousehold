/**
 * Today: what's due, grouped into Needs attention / To do / Waiting for
 * review / Done, with a progress ring for the day and a celebration on every
 * completed chore.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Instance } from "@titan/contracts";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, View } from "react-native";
import { GradientHeader, ProgressRing } from "../../../src/components/brand";
import { Celebration } from "../../../src/components/Celebration";
import { Screen, errorMessage } from "../../../src/components/Screen";
import { AppText, Card, ErrorText } from "../../../src/components/ui";
import { type CardAction, ChoreCard } from "../../../src/features/today/ChoreCard";
import { CompleteSheet } from "../../../src/features/today/CompleteSheet";
import {
  type Scope,
  buildSections,
  dayProgress,
  defaultScope,
} from "../../../src/features/today/sections";
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
  const refresh = () => queryClient.invalidateQueries({ queryKey: agendaKey });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "start" | "defer" | "reset" }) =>
      api.act(familyId!, id, action),
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
        {agenda.isSuccess && sections.length === 0 && (
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
                onAction={(action) => onAction(item, action)}
                onOpen={() => router.push({ pathname: "/chore/[id]", params: { id: item.id } })}
              />
            ))}
          </View>
        ))}
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
