/**
 * Me: profile, the parent's quick-switch PIN, whether this is a shared
 * device, switching person, and signing out.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Modal, Switch, View } from "react-native";
import { PinPad } from "../../../src/components/PinPad";
import { Screen, errorMessage } from "../../../src/components/Screen";
import { AppText, Avatar, Button, Card, ErrorText } from "../../../src/components/ui";
import { useApi, useDeviceMode, useFamily, useSession } from "../../../src/state/AppProvider";
import { colors, spacing } from "../../../src/theme";

export default function Me() {
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, signOut } = useSession();
  const { familyId, membershipId, role, self, family } = useFamily();
  const { deviceMode, setDeviceMode } = useDeviceMode();
  const [choosingPin, setChoosingPin] = useState(false);
  const isParent = role === "PARENT";

  const savePin = useMutation({
    mutationFn: (pin: string) => api.updateMember(familyId!, membershipId!, { pin }),
    onSuccess: () => {
      setChoosingPin(false);
      void queryClient.invalidateQueries({ queryKey: ["family", familyId] });
    },
  });

  return (
    <Screen>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg }}>
        <Avatar
          name={session?.user.displayName ?? "?"}
          color={session?.user.avatarColor ?? colors.primary}
          size={56}
        />
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <AppText variant="h2">{session?.user.displayName ?? ""}</AppText>
          <AppText color={colors.textMuted}>
            {`${isParent ? "Parent" : "Kid"} · ${family.data?.family.name ?? ""}`}
          </AppText>
          {session?.user.email && (
            <AppText variant="caption" color={colors.textMuted}>
              {session.user.email}
            </AppText>
          )}
        </View>
      </Card>

      {isParent && (
        <Card style={{ gap: spacing.md }}>
          <AppText variant="h2">Quick-switch PIN</AppText>
          <AppText color={colors.textMuted}>
            When a kid is using your phone or the family tablet, your PIN switches it back to you
            without typing your password.
          </AppText>
          <ErrorText message={errorMessage(savePin.error)} />
          <Button
            title={self?.hasPin ? "Change my PIN" : "Set my PIN"}
            variant="secondary"
            onPress={() => setChoosingPin(true)}
          />
        </Card>
      )}

      {isParent && (
        <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View style={{ flex: 1, gap: spacing.xxs }}>
            <AppText variant="bodyStrong">Shared family device</AppText>
            <AppText variant="caption" color={colors.textMuted}>
              Opens on "Who's using this?" and goes back there after 2 idle minutes. Turn on for a
              family tablet.
            </AppText>
          </View>
          <Switch
            accessibilityLabel="Shared family device"
            value={deviceMode === "shared"}
            onValueChange={(on) => void setDeviceMode(on ? "shared" : "personal")}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </Card>
      )}

      <Button title="Switch person" variant="secondary" onPress={() => router.push("/who")} />
      <Button title="Sign out" variant="ghost" onPress={() => void signOut()} />

      <Modal
        visible={choosingPin}
        transparent
        animationType="fade"
        onRequestClose={() => setChoosingPin(false)}
      >
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(15, 23, 42, 0.5)",
            padding: spacing.lg,
          }}
        >
          <Card style={{ gap: spacing.lg, alignItems: "center" }}>
            <AppText variant="h2">Choose a PIN</AppText>
            <AppText color={colors.textMuted}>4 to 6 digits. Don't use one your kids know.</AppText>
            <PinPad disabled={savePin.isPending} onSubmit={(pin) => savePin.mutate(pin)} />
            <Button title="Cancel" variant="ghost" onPress={() => setChoosingPin(false)} />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}
