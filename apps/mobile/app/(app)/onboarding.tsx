/**
 * First-time setup for a new parent: name the family, add the kids, pick
 * rooms and starter chores, choose rewards. Four short steps, each saved as
 * it goes; everything after the first can be skipped and done later.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { GradientHeader } from "../../src/components/brand";
import { Screen, errorMessage } from "../../src/components/Screen";
import { AppText, Button, Card, ErrorText, TextField } from "../../src/components/ui";
import { type SetupStep, nextStep, previousStep, stepLabel } from "../../src/features/setup/flow";
import { DoneStep, KidsStep, RewardsStep, RoomsStep } from "../../src/features/setup/SetupSteps";
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

const TITLES: Record<SetupStep, (name: string) => string> = {
  family: (name) => `Welcome${name ? `, ${name}` : ""}!`,
  kids: () => "Who's in the family?",
  rooms: () => "Pick some chores",
  rewards: () => "Rewards",
  done: () => "Ready to go",
};

const SUBTITLES: Record<SetupStep, string> = {
  family: "Let's set up your family. It takes about two minutes.",
  kids: "Add your kids. You can add the other parent at the end.",
  rooms: "We've ticked chores that suit your kids' ages. Untick any you don't want.",
  rewards: "Choose what chores earn. You can change this any time.",
  done: "Your first week is planned.",
};

export default function Onboarding() {
  const router = useRouter();
  const { session } = useSession();
  const [step, setStep] = useState<SetupStep>("family");
  const [familyId, setFamilyId] = useState<string | undefined>(undefined);
  const forward = () => setStep(nextStep(step));
  const back = () => {
    const previous = previousStep(step);
    if (previous) setStep(previous);
  };
  const label = stepLabel(step);

  return (
    <Screen
      header={
        <GradientHeader>
          {label !== undefined && (
            <AppText variant="caption" color={colors.onPrimary}>
              {label}
            </AppText>
          )}
          <AppText variant="h1" color={colors.onPrimary} accessibilityRole="header">
            {TITLES[step](session?.user.displayName ?? "")}
          </AppText>
          <AppText color={colors.onPrimary}>{SUBTITLES[step]}</AppText>
        </GradientHeader>
      }
    >
      {step === "family" || familyId === undefined ? (
        <FamilyStep
          onCreated={(id) => {
            setFamilyId(id);
            setStep("kids");
          }}
        />
      ) : step === "kids" ? (
        <KidsStep familyId={familyId} onNext={forward} />
      ) : step === "rooms" ? (
        <RoomsStep familyId={familyId} onBack={back} onNext={forward} />
      ) : step === "rewards" ? (
        <RewardsStep familyId={familyId} onBack={back} onNext={forward} />
      ) : (
        <DoneStep
          familyId={familyId}
          onToday={() => router.replace("/")}
          onFamily={() => router.replace("/family")}
        />
      )}
    </Screen>
  );
}

function FamilyStep({ onCreated }: { onCreated: (familyId: string) => void }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [timeZone, setTimeZone] = useState(deviceTimeZone);
  const create = useMutation({
    mutationFn: () => api.createFamily({ name: name.trim(), timeZone: timeZone.trim() }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      onCreated(created.family.id);
    },
  });

  return (
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
  );
}
