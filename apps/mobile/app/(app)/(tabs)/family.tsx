/**
 * Family: everyone in the family. Parents can add kid profiles, set PINs,
 * set up a kid's own phone (pairing code), invite another parent, and hand
 * this device to someone.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Member } from "@titan/contracts";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Modal, View } from "react-native";
import { PinPad } from "../../../src/components/PinPad";
import { Screen, errorMessage } from "../../../src/components/Screen";
import {
  AppText,
  Avatar,
  Button,
  Card,
  Chip,
  ErrorText,
  TextField,
} from "../../../src/components/ui";
import { CapacitySheet } from "../../../src/features/family/CapacitySheet";
import { useRewards } from "../../../src/features/rewards/useRewards";
import { formatMinutes, weeklyTotal } from "../../../src/features/week/week";
import { useApi, useFamily } from "../../../src/state/AppProvider";
import { colors, spacing } from "../../../src/theme";

export default function Family() {
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { familyId, role, family, membershipId } = useFamily();
  const isParent = role === "PARENT";
  const rewards = useRewards();
  /** A member's balance in the family's currency, when the viewer may see it. */
  const balanceOf = (m: Member): string | undefined => {
    const row = rewards.summary.data?.members.find((r) => r.member.membershipId === m.id);
    return row && rewards.format ? rewards.format(row.balance) : undefined;
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["family", familyId] });

  const [kidName, setKidName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [pinFor, setPinFor] = useState<Member | null>(null);
  const [capacityFor, setCapacityFor] = useState<Member | null>(null);
  const [pairing, setPairing] = useState<{ name: string; code: string; expiresAt: string } | null>(
    null,
  );

  const addKid = useMutation({
    mutationFn: () => api.createChild(familyId!, { displayName: kidName.trim() }),
    onSuccess: () => {
      setKidName("");
      void refresh();
    },
  });
  const setPin = useMutation({
    mutationFn: ({ member, pin }: { member: Member; pin: string }) =>
      api.updateMember(familyId!, member.id, { pin }),
    onSuccess: () => {
      setPinFor(null);
      void refresh();
    },
  });
  const setCapacity = useMutation({
    mutationFn: ({ member, capacity }: { member: Member; capacity: Member["capacity"] }) =>
      api.updateMember(familyId!, member.id, { capacity }),
    onSuccess: () => {
      setCapacityFor(null);
      void refresh();
      // New capacity re-plans untouched chores, so Today and the week view change too.
      for (const key of ["agenda", "weekLoad"]) {
        void queryClient.invalidateQueries({ queryKey: [key, familyId] });
      }
    },
  });
  const pairPhone = useMutation({
    mutationFn: (member: Member) => api.pairingCode(familyId!, member.id),
    onSuccess: (res, member) => setPairing({ name: member.displayName, ...res }),
  });
  const invite = useMutation({
    mutationFn: () => api.invite(familyId!, { email: inviteEmail.trim(), role: "PARENT" }),
    onSuccess: () => setInviteEmail(""),
  });

  return (
    <Screen>
      <AppText variant="h1" accessibilityRole="header">
        {family.data?.family.name ?? "Family"}
      </AppText>
      <ErrorText message={errorMessage(family.error ?? setPin.error ?? pairPhone.error)} />

      {(family.data?.members ?? []).map((m) => (
        <Card key={m.id} style={{ gap: spacing.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <Avatar name={m.displayName} color={m.avatarColor} />
            <View style={{ flex: 1, gap: spacing.xxs }}>
              <AppText variant="bodyStrong">
                {m.id === membershipId ? `${m.displayName} (you)` : m.displayName}
              </AppText>
              <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
                <Chip label={m.role === "PARENT" ? "PARENT" : "KID"} />
                {m.hasPin && <Chip label="PIN SET" color={colors.success} />}
                <Chip label={`${formatMinutes(weeklyTotal(m.capacity))}/WEEK`} />
                {balanceOf(m) !== undefined && (
                  <Chip label={balanceOf(m)!} color={colors.success} />
                )}
              </View>
            </View>
          </View>
          {isParent && rewards.enabled && (
            <Button
              title="Rewards"
              variant="ghost"
              accessibilityLabel={`Rewards for ${m.displayName}`}
              onPress={() => router.push({ pathname: "/rewards", params: { member: m.id } })}
              style={{ alignSelf: "flex-start" }}
            />
          )}
          {isParent && (
            <Button
              title="Daily time"
              variant="ghost"
              accessibilityLabel={`Daily time for ${m.displayName}`}
              onPress={() => {
                setCapacity.reset();
                setCapacityFor(m);
              }}
              style={{ alignSelf: "flex-start" }}
            />
          )}
          {isParent && m.role === "CHILD" && (
            <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
              <Button
                title="Set up their phone"
                variant="secondary"
                onPress={() => pairPhone.mutate(m)}
                loading={pairPhone.isPending && pairPhone.variables?.id === m.id}
              />
              <Button
                title={m.hasPin ? "Change PIN" : "Set a PIN"}
                variant="ghost"
                onPress={() => setPinFor(m)}
              />
            </View>
          )}
        </Card>
      ))}

      {isParent && (
        <Button
          title="Rewards settings"
          variant="secondary"
          onPress={() => router.push("/rewards-settings")}
        />
      )}
      <Button
        title="Hand this device to someone"
        variant="secondary"
        onPress={() => router.push("/who")}
      />

      {isParent && (
        <>
          <Card style={{ gap: spacing.md }}>
            <AppText variant="h2">Add a kid</AppText>
            <AppText color={colors.textMuted}>
              Kids don't need an email. They can use this device, or their own phone with a setup
              code.
            </AppText>
            <TextField label="Name" value={kidName} onChangeText={setKidName} />
            <ErrorText message={errorMessage(addKid.error)} />
            <Button
              title="Add kid"
              onPress={() => addKid.mutate()}
              loading={addKid.isPending}
              disabled={!kidName.trim()}
            />
          </Card>

          <Card style={{ gap: spacing.md }}>
            <AppText variant="h2">Invite another parent</AppText>
            <TextField
              label="Their email"
              value={inviteEmail}
              onChangeText={setInviteEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              inputMode="email"
            />
            <ErrorText message={errorMessage(invite.error)} />
            {invite.data && (
              <View style={{ gap: spacing.xs }}>
                <AppText variant="caption" color={colors.textMuted}>
                  {`Invite created for ${invite.data.invite.email}. Until email sending exists, share this code with them:`}
                </AppText>
                <AppText variant="mono" selectable>
                  {invite.data.token}
                </AppText>
              </View>
            )}
            <Button
              title="Create invite"
              variant="secondary"
              onPress={() => invite.mutate()}
              loading={invite.isPending}
              disabled={!inviteEmail.includes("@")}
            />
          </Card>
        </>
      )}

      <CapacitySheet
        member={capacityFor}
        saving={setCapacity.isPending}
        error={errorMessage(setCapacity.error)}
        onSave={(capacity) => capacityFor && setCapacity.mutate({ member: capacityFor, capacity })}
        onClose={() => setCapacityFor(null)}
      />

      <Modal
        visible={pinFor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPinFor(null)}
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
            <AppText variant="h2">{`New PIN for ${pinFor?.displayName ?? ""}`}</AppText>
            <AppText color={colors.textMuted}>4 to 6 digits</AppText>
            <PinPad
              disabled={setPin.isPending}
              onSubmit={(pin) => pinFor && setPin.mutate({ member: pinFor, pin })}
            />
            <Button title="Cancel" variant="ghost" onPress={() => setPinFor(null)} />
          </Card>
        </View>
      </Modal>

      <Modal
        visible={pairing !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPairing(null)}
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
          <Card style={{ gap: spacing.lg, alignItems: "center", maxWidth: 420 }}>
            <AppText variant="h2">{`Set up ${pairing?.name ?? ""}'s phone`}</AppText>
            <AppText color={colors.textMuted} style={{ textAlign: "center" }}>
              On their phone, open Titan Household, tap "Setting up a kid's phone?", and enter:
            </AppText>
            <AppText
              variant="display"
              style={{ fontFamily: "RobotoMono_500Medium", letterSpacing: 4 }}
              selectable
            >
              {pairing?.code ?? ""}
            </AppText>
            <AppText variant="caption" color={colors.textMuted}>
              {pairing
                ? `Works once, until ${new Date(pairing.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
                : ""}
            </AppText>
            <Button title="Done" onPress={() => setPairing(null)} />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}
