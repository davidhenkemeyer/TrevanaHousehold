/**
 * The steps of first-time setup after the family exists: kids, rooms (starter
 * chores), rewards, and the finish card. Each step saves through the API as it
 * goes, so leaving setup halfway keeps whatever was done.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RewardCurrency } from "@tenara/domain";
import { AGE_GROUP_LABELS, type AgeGroup, ROOMS, type Room } from "@tenara/domain";
import { type ReactNode, useEffect, useState } from "react";
import { View } from "react-native";
import { ChoiceChips, FieldLabel, Section, SelectChip } from "../../components/forms";
import { errorMessage } from "../../components/Screen";
import { AppText, Avatar, Button, Card, ErrorText, TextField } from "../../components/ui";
import { useApi } from "../../state/AppProvider";
import { colors, spacing } from "../../theme";
import { StarterPicker } from "../starter/StarterPicker";
import {
  CHORE_CACHES,
  addLabel,
  initialSelection,
  selectedInRooms,
  toggleId,
  visibleRooms,
} from "../starter/selection";
import { AGE_GROUP_OPTIONS, DEFAULT_ROOMS, describeKidTime, toggleRoom } from "./flow";

/** Back / Skip on the left, the main action on the right. */
export function StepFooter({
  onBack,
  onSkip,
  children,
}: {
  onBack?: (() => void) | undefined;
  onSkip?: (() => void) | undefined;
  children: ReactNode;
}) {
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
      {onBack && <Button title="Back" variant="ghost" onPress={onBack} />}
      {onSkip && <Button title="Skip" variant="ghost" onPress={onSkip} />}
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

export function KidsStep({ familyId, onNext }: { familyId: string; onNext: () => void }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const family = useQuery({ queryKey: ["family", familyId], queryFn: () => api.family(familyId) });
  const kids = (family.data?.members ?? []).filter((m) => m.role === "CHILD");
  const [name, setName] = useState("");
  const [ageGroup, setAgeGroup] = useState<AgeGroup>("KID");
  const [pin, setPin] = useState("");
  const pinOk = pin === "" || /^\d{4,6}$/.test(pin);

  const add = useMutation({
    mutationFn: () =>
      api.createChild(familyId, {
        displayName: name.trim(),
        ageGroup,
        ...(pin !== "" && { pin }),
      }),
    onSuccess: () => {
      setName("");
      setPin("");
      void queryClient.invalidateQueries({ queryKey: ["family", familyId] });
    },
  });

  return (
    <>
      {kids.length > 0 && (
        <Card style={{ gap: spacing.sm }}>
          {kids.map((k) => (
            <View
              key={k.id}
              style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
            >
              <Avatar name={k.displayName} color={k.avatarColor} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">{k.displayName}</AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  {[k.ageGroup ? AGE_GROUP_LABELS[k.ageGroup] : null, describeKidTime(k.capacity)]
                    .filter((part) => part !== null)
                    .join(" · ")}
                </AppText>
              </View>
            </View>
          ))}
        </Card>
      )}
      <Section
        title={kids.length === 0 ? "Add your first kid" : "Add another kid"}
        hint="Their age sets how much chore time they get each day and which chores suit them. You can change it later."
      >
        <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Sally" />
        <FieldLabel>Age</FieldLabel>
        <ChoiceChips options={AGE_GROUP_OPTIONS} value={ageGroup} onChange={setAgeGroup} />
        <TextField
          label="PIN (optional, 4 to 6 digits)"
          value={pin}
          onChangeText={setPin}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          error={pinOk ? undefined : "A PIN is 4 to 6 digits."}
        />
        <AppText variant="caption" color={colors.textMuted}>
          A PIN stops brothers and sisters from switching to each other on a shared tablet.
        </AppText>
        <ErrorText message={errorMessage(add.error)} />
        <Button
          title="Add kid"
          variant="secondary"
          onPress={() => add.mutate()}
          loading={add.isPending}
          disabled={!name.trim() || !pinOk}
        />
      </Section>
      <StepFooter onSkip={kids.length === 0 ? onNext : undefined}>
        <Button title="Next" onPress={onNext} disabled={kids.length === 0} />
      </StepFooter>
    </>
  );
}

export function RoomsStep({
  familyId,
  onBack,
  onNext,
}: {
  familyId: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ["starter", familyId],
    queryFn: () => api.starterChores(familyId),
  });
  const [rooms, setRooms] = useState<Room[]>([...DEFAULT_ROOMS]);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (selected === null && list.data) setSelected(initialSelection(list.data, rooms));
  }, [list.data, selected, rooms]);

  const ids = list.data && selected ? selectedInRooms(list.data, selected, rooms) : [];
  const add = useMutation({
    mutationFn: () => api.addStarterChores(familyId, ids),
    onSuccess: () => {
      for (const key of CHORE_CACHES) {
        void queryClient.invalidateQueries({ queryKey: [key, familyId] });
      }
      onNext();
    },
  });

  const flipRoom = (room: Room) => {
    const next = toggleRoom(rooms, room, ROOMS);
    setRooms(next);
    // A room switched on brings its suggestions with it.
    if (list.data && selected && next.includes(room)) {
      setSelected(new Set([...selected, ...initialSelection(list.data, [room])]));
    }
  };

  return (
    <>
      <ErrorText message={errorMessage(list.error)} />
      {list.data && selected && (
        <>
          <Section title="Which rooms?" hint="Pick the ones your family looks after.">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
              {list.data.rooms.map((r) => (
                <SelectChip
                  key={r.room}
                  label={r.label}
                  selected={rooms.includes(r.room)}
                  onPress={() => flipRoom(r.room)}
                />
              ))}
            </View>
          </Section>
          <StarterPicker
            rooms={visibleRooms(list.data, rooms)}
            selected={selected}
            onToggle={(id) => setSelected(toggleId(selected, id))}
          />
        </>
      )}
      <ErrorText message={errorMessage(add.error)} />
      <StepFooter onBack={onBack} onSkip={onNext}>
        <Button
          title={ids.length === 0 ? "Next" : addLabel(ids.length)}
          onPress={() => (ids.length === 0 ? onNext() : add.mutate())}
          loading={add.isPending}
        />
      </StepFooter>
    </>
  );
}

const REWARD_OPTIONS: readonly { value: RewardCurrency; label: string; hint: string }[] = [
  {
    value: "POINTS",
    label: "Points",
    hint: "Kids earn points and trade them for rewards you choose, like screen time or a trip for ice cream.",
  },
  {
    value: "MONEY",
    label: "Real money",
    hint: "Kids earn an allowance. You record payouts when you hand over the cash.",
  },
  {
    value: "NONE",
    label: "Nothing",
    hint: "Chores are just chores. Kids still earn XP, levels, and badges.",
  },
];

export function RewardsStep({
  familyId,
  onBack,
  onNext,
}: {
  familyId: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [currency, setCurrency] = useState<RewardCurrency>("POINTS");
  const save = useMutation({
    mutationFn: () => api.updateFamily(familyId, { rewardCurrency: currency }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["family", familyId] });
      onNext();
    },
  });
  const hint = REWARD_OPTIONS.find((o) => o.value === currency)?.hint;

  return (
    <>
      <Section
        title="What do chores earn?"
        hint="Routine chores earn XP either way. Extra jobs earn this too."
      >
        <ChoiceChips options={REWARD_OPTIONS} value={currency} onChange={setCurrency} />
        {hint !== undefined && <AppText color={colors.textMuted}>{hint}</AppText>}
      </Section>
      <ErrorText message={errorMessage(save.error)} />
      <StepFooter onBack={onBack} onSkip={onNext}>
        <Button title="Next" onPress={() => save.mutate()} loading={save.isPending} />
      </StepFooter>
    </>
  );
}

export function DoneStep({
  familyId,
  onToday,
  onFamily,
}: {
  familyId: string;
  onToday: () => void;
  onFamily: () => void;
}) {
  const api = useApi();
  const chores = useQuery({
    queryKey: ["chores", familyId, false],
    queryFn: () => api.chores(familyId),
  });
  const count = chores.data?.chores.length ?? 0;
  return (
    <>
      <Card style={{ gap: spacing.sm, alignItems: "center" }}>
        <AppText variant="h2">You're all set</AppText>
        <AppText color={colors.textMuted} style={{ textAlign: "center" }}>
          {count === 0
            ? "Add chores any time from the Chores tab."
            : `${count === 1 ? "1 chore is" : `${count} chores are`} planned for the week, spread by everyone's age and time.`}
        </AppText>
      </Card>
      <Button title="Go to Today" onPress={onToday} />
      <Button title="Invite the other parent" variant="secondary" onPress={onFamily} />
    </>
  );
}
