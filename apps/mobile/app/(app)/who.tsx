/**
 * "Who's using this?": hand a device to someone else in the family.
 *
 * The server decides what's allowed; this screen only asks for a PIN when it
 * will be needed: always for a parent (who must have set one), and for a kid
 * when another kid with a PIN is being switched to. A parent without a PIN
 * signs in with their password instead.
 */
import { useMutation } from "@tanstack/react-query";
import type { Member } from "@tenara/contracts";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { GradientHeader } from "../../src/components/brand";
import { PinPad } from "../../src/components/PinPad";
import { Screen, errorMessage } from "../../src/components/Screen";
import { AppText, Avatar, Button, Card, ErrorText } from "../../src/components/ui";
import { ApiError } from "../../src/api/http";
import { useApi, useFamily, useSession } from "../../src/state/AppProvider";
import { colors, radii, spacing } from "../../src/theme";

export default function Who() {
  const api = useApi();
  const router = useRouter();
  const { session, start, signOut } = useSession();
  const { familyId, role, family, membershipId } = useFamily();
  const [target, setTarget] = useState<Member | null>(null);
  const [showPin, setShowPin] = useState(false);

  const switchTo = useMutation({
    mutationFn: ({ member, pin }: { member: Member; pin?: string }) =>
      api.switchTo(familyId!, member.id, pin),
    onSuccess: async (auth) => {
      setShowPin(false);
      setTarget(null);
      await start(auth);
      router.replace("/");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "PIN_REQUIRED") setShowPin(true);
    },
  });

  const choose = (member: Member) => {
    if (member.id === membershipId) {
      router.replace("/"); // it's already you
      return;
    }
    setTarget(member);
    switchTo.reset();
    const needsPin = member.role === "PARENT" || (role === "CHILD" && member.hasPin);
    if (member.role === "PARENT" && !member.hasPin) return; // offer password sign-in below
    if (needsPin) setShowPin(true);
    else switchTo.mutate({ member });
  };

  const members = family.data?.members ?? [];
  return (
    <Screen
      header={
        <GradientHeader>
          <AppText variant="h1" color="#FFFFFF" accessibilityRole="header">
            Who's using this?
          </AppText>
          <AppText color="#FFFFFF">Tap your name.</AppText>
        </GradientHeader>
      }
    >
      <View style={styles.grid}>
        {members.map((m) => (
          <Pressable
            key={m.id}
            accessibilityRole="button"
            accessibilityLabel={`${m.displayName}${m.id === membershipId ? " (current)" : ""}`}
            onPress={() => choose(m)}
            style={({ pressed }) => [styles.person, pressed && { transform: [{ scale: 0.97 }] }]}
          >
            <Avatar name={m.displayName} color={m.avatarColor} size={64} />
            <AppText variant="bodyStrong">{m.displayName}</AppText>
            {m.id === membershipId && (
              <AppText variant="caption" color={colors.textMuted}>
                Using now
              </AppText>
            )}
          </Pressable>
        ))}
      </View>

      {target && target.role === "PARENT" && !target.hasPin && (
        <Card style={{ gap: spacing.md }}>
          <AppText>
            {target.displayName} hasn't set a quick-switch PIN, so they need to sign in with their
            password.
          </AppText>
          <Button title={`Sign in as ${target.displayName}`} onPress={() => void signOut()} />
        </Card>
      )}
      <ErrorText message={showPin ? null : errorMessage(switchTo.error)} />
      {session && (
        <AppText variant="caption" color={colors.textMuted} style={{ textAlign: "center" }}>
          Signed in as {session.user.displayName}
        </AppText>
      )}

      <Modal
        visible={showPin && target !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPin(false)}
      >
        <View style={styles.backdrop}>
          <Card style={{ gap: spacing.lg, alignItems: "center" }}>
            <AppText variant="h2">{target?.displayName}'s PIN</AppText>
            <PinPad
              disabled={switchTo.isPending}
              onSubmit={(pin) => target && switchTo.mutate({ member: target, pin })}
            />
            <ErrorText message={errorMessage(switchTo.error)} />
            <Button title="Cancel" variant="ghost" onPress={() => setShowPin(false)} />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg, justifyContent: "center" },
  person: {
    width: 140,
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
});
