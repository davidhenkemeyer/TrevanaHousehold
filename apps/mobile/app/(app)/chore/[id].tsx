/**
 * Chore detail: what to do (cue, description, checklist), the latest
 * feedback, and the full history of attempts and status changes.
 */
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { GradientHeader } from "../../../src/components/brand";
import { Screen, errorMessage } from "../../../src/components/Screen";
import { AppText, Card, Chip, ErrorText } from "../../../src/components/ui";
import { dueLabel } from "../../../src/features/today/sections";
import { useApi, useFamily } from "../../../src/state/AppProvider";
import { colors, spacing } from "../../../src/theme";

const STATUS_LABEL: Record<string, string> = {
  NEW: "To do",
  IN_PROGRESS: "In progress",
  DEFERRED: "Later",
  PENDING_REVIEW: "Waiting for review",
  APPROVED: "Approved",
  NEEDS_REWORK: "Try again",
  REJECTED: "Not accepted",
  CANCELED: "Canceled",
};

const ACTION_LABEL: Record<string, string> = {
  start: "started",
  defer: "put it off",
  reset: "stopped",
  complete: "marked it done",
  approve: "approved it",
  requestRework: "asked for another try",
  reject: "didn't accept it",
  cancel: "canceled it",
  markLate: "It became late",
};

const when = (iso: string) =>
  new Date(iso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });

export default function ChoreDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const { familyId } = useFamily();
  const detail = useQuery({
    queryKey: ["instance", familyId, id],
    queryFn: () => api.instance(familyId!, id),
    enabled: familyId !== undefined && typeof id === "string",
  });
  const d = detail.data;

  return (
    <Screen
      header={
        <GradientHeader>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            style={{ alignSelf: "flex-start", paddingVertical: spacing.xs }}
          >
            <AppText variant="bodyStrong" color="#FFFFFF">
              ‹ Back
            </AppText>
          </Pressable>
          <AppText variant="h1" color="#FFFFFF" accessibilityRole="header">
            {d?.choreName ?? ""}
          </AppText>
          {d?.cue && <AppText color="#FFFFFF">{`When: ${d.cue}`}</AppText>}
        </GradientHeader>
      }
    >
      <ErrorText message={errorMessage(detail.error)} />
      {d && (
        <>
          <Card style={{ gap: spacing.md }}>
            <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
              <Chip label={STATUS_LABEL[d.status]?.toUpperCase() ?? d.status} color={colors.info} />
              {d.isLate && <Chip label="LATE" color={colors.attention} filled />}
              <Chip label={`${d.effortMinutes} MIN`} />
            </View>
            {d.description !== "" && <AppText>{d.description}</AppText>}
            <AppText variant="caption" color={colors.textMuted}>
              {`${dueLabel(d.dueAt)} · for ${d.assignees.map((a) => a.displayName).join(" & ")}`}
            </AppText>
            {d.checklist.length > 0 && (
              <View style={{ gap: spacing.xs }}>
                <AppText variant="bodyStrong">Steps</AppText>
                {d.checklist.map((step, i) => (
                  <AppText key={step.id}>{`${i + 1}. ${step.text}`}</AppText>
                ))}
              </View>
            )}
          </Card>

          {d.submissions.length > 0 && (
            <View style={{ gap: spacing.md }}>
              <AppText variant="bodyStrong" color={colors.textMuted}>
                Attempts
              </AppText>
              {[...d.submissions].reverse().map((s) => (
                <Card key={s.id} style={{ gap: spacing.sm }}>
                  <AppText variant="caption" color={colors.textMuted}>
                    {`${s.submittedBy.displayName} · ${when(s.submittedAt)}`}
                  </AppText>
                  {s.checklistSummary.total > 0 && (
                    <Chip
                      label={`${s.checklistSummary.checked}/${s.checklistSummary.total} STEPS`}
                    />
                  )}
                  {s.reviews.map((r) => (
                    <View key={r.id} style={{ gap: spacing.xxs }}>
                      <AppText
                        variant="bodyStrong"
                        color={r.action === "APPROVE" ? colors.success : colors.attention}
                      >
                        {r.action === "APPROVE"
                          ? `Approved${r.reviewer ? ` by ${r.reviewer.displayName}` : " automatically"}`
                          : r.action === "REQUEST_REWORK"
                            ? `${r.reviewer?.displayName ?? "A parent"} asked for another try`
                            : `Not accepted by ${r.reviewer?.displayName ?? "a parent"}`}
                      </AppText>
                      {r.note && <AppText>{r.note}</AppText>}
                    </View>
                  ))}
                </Card>
              ))}
            </View>
          )}

          {d.events.length > 0 && (
            <View style={{ gap: spacing.sm }}>
              <AppText variant="bodyStrong" color={colors.textMuted}>
                History
              </AppText>
              {d.events.map((e, i) => (
                <AppText key={i} variant="caption" color={colors.textMuted}>
                  {`${when(e.createdAt)} · ${e.actor ? `${e.actor.displayName} ${ACTION_LABEL[e.action] ?? e.action}` : (ACTION_LABEL[e.action] ?? e.action)}`}
                </AppText>
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}
