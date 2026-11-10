import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { GradientHeader } from "../../src/components/brand";
import { Screen, errorMessage } from "../../src/components/Screen";
import { AppText, Button, Card, ErrorText, TextField } from "../../src/components/ui";
import { useApi, useSession } from "../../src/state/AppProvider";
import { colors, spacing } from "../../src/theme";

/** The device's time zone (e.g. "America/Chicago"), used as the family's default. */
function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/Chicago";
  }
}

export default function Onboarding() {
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [name, setName] = useState("");
  const [timeZone, setTimeZone] = useState(deviceTimeZone);
  const create = useMutation({
    mutationFn: () => api.createFamily({ name: name.trim(), timeZone: timeZone.trim() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      router.replace("/family");
    },
  });

  return (
    <Screen
      header={
        <GradientHeader>
          <AppText variant="h1" color="#FFFFFF" accessibilityRole="header">
            Welcome{session ? `, ${session.user.displayName}` : ""}!
          </AppText>
          <AppText color="#FFFFFF">Let's set up your family. You'll add your kids next.</AppText>
        </GradientHeader>
      }
    >
      <Card style={{ gap: spacing.lg }}>
        <TextField
          label="Family name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. The Smiths"
        />
        <TextField
          label="Time zone"
          value={timeZone}
          onChangeText={setTimeZone}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <AppText variant="caption" color={colors.textMuted}>
          Chores are scheduled in this time zone. We filled in this device's.
        </AppText>
        <ErrorText message={errorMessage(create.error)} />
        <Button
          title="Create family"
          onPress={() => create.mutate()}
          loading={create.isPending}
          disabled={!name.trim() || !timeZone.trim()}
        />
      </Card>
    </Screen>
  );
}
