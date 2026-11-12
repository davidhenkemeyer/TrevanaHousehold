/**
 * Chores (parents): the family's chores, and the week ahead.
 *
 *  - Chores: every chore with its schedule and who does it; tap to edit,
 *    "New chore" to add one.
 *  - Week: minutes of chores vs. each member's time, day by day, so parents
 *    can spot overloaded days and fix them (edit a chore or someone's time).
 */
import { useQuery } from "@tanstack/react-query";
import { type Member, toRecurrenceRule } from "@tenara/contracts";
import {
  type PlainDate,
  describeRecurrence,
  instantToPlainDate,
  minutesPerAssignee,
} from "@tenara/domain";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { GradientHeader } from "../../../src/components/brand";
import { Segmented, Sheet, ToggleRow } from "../../../src/components/forms";
import { Screen, errorMessage } from "../../../src/components/Screen";
import { AppText, Button, Card, Chip, ErrorText } from "../../../src/components/ui";
import { describeAssignment } from "../../../src/features/chores/form";
import { dayLabel, formatMinutes, shiftWeek } from "../../../src/features/week/week";
import { WeekGrid } from "../../../src/features/week/WeekGrid";
import { useApi, useFamily } from "../../../src/state/AppProvider";
import { colors, spacing } from "../../../src/theme";

type Tab = "chores" | "week";

export default function Chores() {
  const [view, setView] = useState<Tab>("chores");
  return (
    <Screen
      header={
        <GradientHeader>
          <AppText variant="h1" color={colors.onPrimary} accessibilityRole="header">
            Chores
          </AppText>
          <Segmented
            options={[
              { value: "chores", label: "Chores" },
              { value: "week", label: "Week" },
            ]}
            value={view}
            onChange={setView}
          />
        </GradientHeader>
      }
    >
      {view === "chores" ? <ChoreList /> : <WeekView />}
    </Screen>
  );
}

function ChoreList() {
  const api = useApi();
  const router = useRouter();
  const { familyId, family } = useFamily();
  const [showArchived, setShowArchived] = useState(false);
  const chores = useQuery({
    queryKey: ["chores", familyId, showArchived],
    queryFn: () => api.chores(familyId!, showArchived),
    enabled: familyId !== undefined,
  });
  const members = family.data?.members ?? [];
  const list = chores.data?.chores ?? [];

  return (
    <>
      <Button
        title="New chore"
        onPress={() => router.push({ pathname: "/chore-edit/[id]", params: { id: "new" } })}
      />
      <ErrorText message={errorMessage(chores.error)} />
      {chores.isSuccess && list.length === 0 && (
        <Card style={{ alignItems: "center", gap: spacing.sm }}>
          <AppText variant="h2">No chores yet</AppText>
          <AppText color={colors.textMuted} style={{ textAlign: "center" }}>
            Add the first one: dishes, feeding the dog, making beds. Tenara Family spreads them
            across the family by how much time everyone has.
          </AppText>
        </Card>
      )}
      {list.map((c) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${c.name}`}
          onPress={() => router.push({ pathname: "/chore-edit/[id]", params: { id: c.id } })}
        >
          <Card style={{ gap: spacing.xs, opacity: c.active ? 1 : 0.6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <AppText variant="bodyStrong" style={{ flex: 1 }}>
                {c.name}
              </AppText>
              <Chip label={`${c.effortMinutes} MIN`} />
              {!c.active && <Chip label="ARCHIVED" />}
            </View>
            <AppText color={colors.textMuted}>
              {describeRecurrence(toRecurrenceRule(c.recurrence))}
            </AppText>
            <AppText variant="caption" color={colors.textMuted}>
              {describeAssignment(c, members)}
              {c.cue ? ` · ${c.cue}` : ""}
            </AppText>
          </Card>
        </Pressable>
      ))}
      <ToggleRow label="Show archived chores" value={showArchived} onChange={setShowArchived} />
    </>
  );
}

function WeekView() {
  const api = useApi();
  const router = useRouter();
  const { familyId, family } = useFamily();
  const timeZone = family.data?.family.timeZone;
  const today = timeZone ? instantToPlainDate(new Date(), timeZone) : undefined;
  const [from, setFrom] = useState<PlainDate | undefined>(undefined);
  const start = from ?? today;
  const [selected, setSelected] = useState<{ date: PlainDate; member: Member } | null>(null);

  const load = useQuery({
    queryKey: ["weekLoad", familyId, start],
    queryFn: () => api.weekLoad(familyId!, { ...(start !== undefined && { from: start }) }),
    enabled: familyId !== undefined && start !== undefined,
  });
  const dayChores = useQuery({
    queryKey: ["instance", familyId, "day", selected?.date, selected?.member.id],
    queryFn: () =>
      api.instances(familyId!, {
        from: selected!.date,
        to: selected!.date,
        memberId: selected!.member.id,
      }),
    enabled: familyId !== undefined && selected !== null,
  });

  const members = family.data?.members ?? [];
  const overloaded = (load.data?.days ?? []).flatMap((d) =>
    d.members.filter((m) => m.overCapacity).map((m) => ({ ...m, date: d.date })),
  );
  const selectedCell = selected
    ? load.data?.days
        .find((d) => d.date === selected.date)
        ?.members.find((m) => m.membershipId === selected.member.id)
    : undefined;

  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Button
          title="‹"
          variant="secondary"
          accessibilityLabel="Previous week"
          onPress={() => start && setFrom(shiftWeek(start, -1))}
        />
        <AppText variant="bodyStrong" style={{ flex: 1, textAlign: "center" }}>
          {start === undefined ? "" : start === today ? "This week" : `From ${dayLabel(start)}`}
        </AppText>
        <Button
          title="›"
          variant="secondary"
          accessibilityLabel="Next week"
          onPress={() => start && setFrom(shiftWeek(start, 1))}
        />
      </View>
      {start !== today && (
        <Button title="Back to this week" variant="ghost" onPress={() => setFrom(undefined)} />
      )}

      <ErrorText message={errorMessage(load.error)} />
      {(load.data?.choresWithoutOwners.length ?? 0) > 0 && (
        <Card style={{ gap: spacing.xs, borderColor: colors.attention }}>
          <AppText variant="bodyStrong" color={colors.attention}>
            Nobody is doing these
          </AppText>
          <AppText color={colors.textMuted}>
            {`Everyone they were assigned to has left: ${load.data?.choresWithoutOwners.map((c) => c.name).join(", ")}. Edit them to pick someone.`}
          </AppText>
        </Card>
      )}
      {load.isSuccess && (
        <AppText color={overloaded.length > 0 ? colors.attention : colors.textMuted}>
          {overloaded.length === 0
            ? "Everyone has enough time for their chores this week."
            : `${overloaded.length} ${overloaded.length === 1 ? "day has" : "days have"} more chores than time. Tap one to see what's on it.`}
        </AppText>
      )}
      {load.data && (
        <WeekGrid
          load={load.data}
          members={members}
          today={today}
          onSelect={(date, member) => setSelected({ date, member })}
        />
      )}

      <Sheet visible={selected !== null} onClose={() => setSelected(null)}>
        <View style={{ gap: spacing.xs }}>
          <AppText variant="h2">
            {selected ? `${selected.member.displayName} · ${dayLabel(selected.date)}` : ""}
          </AppText>
          {selectedCell && (
            <AppText color={selectedCell.overCapacity ? colors.attention : colors.textMuted}>
              {`${formatMinutes(selectedCell.assignedMinutes)} of chores, ${formatMinutes(selectedCell.capacityMinutes)} of time`}
            </AppText>
          )}
        </View>
        <ErrorText message={errorMessage(dayChores.error)} />
        {dayChores.isSuccess && dayChores.data.items.length === 0 && (
          <AppText color={colors.textMuted}>No chores that day.</AppText>
        )}
        {dayChores.data?.items.map((i) => (
          <Pressable
            key={i.id}
            accessibilityRole="button"
            onPress={() => {
              setSelected(null);
              router.push({ pathname: "/chore/[id]", params: { id: i.id } });
            }}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
          >
            <AppText style={{ flex: 1 }}>{i.choreName}</AppText>
            <Chip
              label={
                i.assignees.length > 1
                  ? `${minutesPerAssignee(i.effortMinutes, i.assignees.length)} OF ${i.effortMinutes} MIN`
                  : `${i.effortMinutes} MIN`
              }
            />
          </Pressable>
        ))}
        {selectedCell?.overCapacity && (
          <AppText variant="caption" color={colors.textMuted}>
            {`To fix it, give ${selected?.member.displayName ?? "them"} more time on the Family tab, or edit a chore to spread it out.`}
          </AppText>
        )}
        <Button title="Close" variant="ghost" onPress={() => setSelected(null)} />
      </Sheet>
    </>
  );
}
