/**
 * "Add from the starter list" (parents): ready-made chores by room, with the
 * ones that suit this family's ages ticked. Adding them plans them right away.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Room } from "@tenara/domain";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { GradientHeader } from "../../src/components/brand";
import { BackLink, SelectChip } from "../../src/components/forms";
import { Screen, errorMessage } from "../../src/components/Screen";
import { AppText, Button, Card, ErrorText } from "../../src/components/ui";
import { StarterPicker } from "../../src/features/starter/StarterPicker";
import {
  CHORE_CACHES,
  addLabel,
  initialSelection,
  selectedInRooms,
  toggleId,
  visibleRooms,
} from "../../src/features/starter/selection";
import { useApi, useFamily } from "../../src/state/AppProvider";
import { colors, spacing } from "../../src/theme";

export default function Starter() {
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { familyId } = useFamily();
  const [room, setRoom] = useState<Room | undefined>(undefined);
  const [selected, setSelected] = useState<Set<string> | null>(null);

  const list = useQuery({
    queryKey: ["starter", familyId],
    queryFn: () => api.starterChores(familyId!),
    enabled: familyId !== undefined,
  });
  useEffect(() => {
    if (selected === null && list.data) setSelected(initialSelection(list.data));
  }, [list.data, selected]);

  const rooms = room === undefined ? undefined : [room];
  const ids = list.data && selected ? selectedInRooms(list.data, selected) : [];
  const add = useMutation({
    mutationFn: () => api.addStarterChores(familyId!, ids),
    onSuccess: () => {
      for (const key of CHORE_CACHES) {
        void queryClient.invalidateQueries({ queryKey: [key, familyId] });
      }
      router.back();
    },
  });

  return (
    <Screen
      header={
        <GradientHeader>
          <BackLink onPress={() => router.back()} />
          <AppText variant="h1" color={colors.onPrimary} accessibilityRole="header">
            Starter chores
          </AppText>
          <AppText color={colors.onPrimary}>
            Pick what your family does. We've ticked the ones that suit your kids' ages.
          </AppText>
        </GradientHeader>
      }
    >
      <ErrorText message={errorMessage(list.error)} />
      {list.data && selected && (
        <>
          <Card style={{ gap: spacing.sm }}>
            <AppText variant="caption" color={colors.textMuted}>
              Show
            </AppText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
              <SelectChip
                label="All rooms"
                selected={room === undefined}
                onPress={() => setRoom(undefined)}
              />
              {list.data.rooms.map((r) => (
                <SelectChip
                  key={r.room}
                  label={r.label}
                  selected={room === r.room}
                  onPress={() => setRoom(r.room)}
                />
              ))}
            </View>
          </Card>
          <StarterPicker
            rooms={visibleRooms(list.data, rooms)}
            selected={selected}
            onToggle={(id) => setSelected(toggleId(selected, id))}
          />
          <ErrorText message={errorMessage(add.error)} />
          <Button
            title={addLabel(ids.length)}
            onPress={() => add.mutate()}
            loading={add.isPending}
            disabled={ids.length === 0}
          />
          <AppText variant="caption" color={colors.textMuted}>
            Each chore goes to whoever is old enough and has time that day. You can change any of
            them later.
          </AppText>
        </>
      )}
    </Screen>
  );
}
