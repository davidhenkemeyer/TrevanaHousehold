/**
 * Rewards settings (parents): what chores pay in (nothing, real money, or
 * points), and for points, the catalog of rewards kids can ask for.
 *
 * Switching never converts or erases anything: earlier balances stay visible
 * on each person's rewards page until a parent settles them.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MONEY_CODES, type MoneyCode, type RewardCurrency } from "@titan/domain";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { GradientHeader } from "../../src/components/brand";
import { BackLink, ChoiceChips, FieldLabel, Section } from "../../src/components/forms";
import { Screen, errorMessage } from "../../src/components/Screen";
import { AppText, Button, ErrorText, TextField } from "../../src/components/ui";
import { parseAmountInput } from "../../src/features/rewards/format";
import { invalidateRewards, useRewards } from "../../src/features/rewards/useRewards";
import { useApi, useFamily } from "../../src/state/AppProvider";
import { colors, spacing } from "../../src/theme";

const CURRENCY_HINT: Record<RewardCurrency, string> = {
  NONE: "Chores don't earn anything. (Levels and badges arrive in a later update and work without rewards.)",
  MONEY:
    "Chores earn real money. You record what you've paid out; the app keeps the running total.",
  POINTS:
    "Chores earn points, which kids trade for rewards you choose: screen time, picking dinner, a later bedtime.",
};

export default function RewardsSettings() {
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { familyId, family, role } = useFamily();
  const { currency, currencyCode, format } = useRewards();
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["family", familyId] });
    void queryClient.invalidateQueries({ queryKey: ["rewardItems", familyId] });
    void queryClient.invalidateQueries({ queryKey: ["agenda", familyId] });
    invalidateRewards(queryClient, familyId);
  };
  const update = useMutation({
    mutationFn: (body: { rewardCurrency?: RewardCurrency; currencyCode?: MoneyCode }) =>
      api.updateFamily(familyId!, body),
    onSettled: refresh,
  });

  const catalog = useQuery({
    queryKey: ["rewardItems", familyId],
    queryFn: () => api.rewardItems(familyId!),
    enabled: familyId !== undefined && currency === "POINTS",
  });
  const parsedCost = parseAmountInput("POINTS", cost);
  const addItem = useMutation({
    mutationFn: () => api.createRewardItem(familyId!, { name: name.trim(), cost: parsedCost! }),
    onSuccess: () => {
      setName("");
      setCost("");
    },
    onSettled: refresh,
  });
  const removeItem = useMutation({
    mutationFn: (itemId: string) => api.removeRewardItem(familyId!, itemId),
    onSettled: refresh,
  });

  return (
    <Screen
      header={
        <GradientHeader>
          <BackLink onPress={() => router.back()} />
          <AppText variant="h1" color={colors.onPrimary} accessibilityRole="header">
            Rewards settings
          </AppText>
        </GradientHeader>
      }
    >
      <ErrorText
        message={errorMessage(family.error ?? update.error ?? catalog.error ?? removeItem.error)}
      />
      {role !== "PARENT" ? (
        <AppText color={colors.textMuted}>Only a parent can change how rewards work.</AppText>
      ) : (
        currency !== undefined && (
          <>
            <Section title="What chores earn" hint={CURRENCY_HINT[currency]}>
              <ChoiceChips
                options={[
                  { value: "NONE", label: "Nothing" },
                  { value: "MONEY", label: "Real money" },
                  { value: "POINTS", label: "Points" },
                ]}
                value={currency}
                onChange={(rewardCurrency) => update.mutate({ rewardCurrency })}
              />
              {currency === "MONEY" && (
                <>
                  <FieldLabel>Currency</FieldLabel>
                  <ChoiceChips
                    options={MONEY_CODES.map((code) => ({ value: code, label: code }))}
                    value={(currencyCode ?? "USD") as MoneyCode}
                    onChange={(code) => update.mutate({ currencyCode: code })}
                  />
                </>
              )}
              <AppText variant="caption" color={colors.textMuted}>
                Everyday routines don't earn rewards unless you choose to pay for one; extra jobs
                do. Changing this later keeps what everyone has already earned.
              </AppText>
            </Section>

            {currency === "POINTS" && format && (
              <Section
                title="Rewards to choose from"
                hint="Kids ask for one; the points are set aside until you say yes or not now."
              >
                {catalog.data?.items.map((item) => (
                  <View
                    key={item.id}
                    style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
                  >
                    <AppText style={{ flex: 1 }}>{item.name}</AppText>
                    <AppText variant="mono" color={colors.textMuted}>
                      {format(item.cost)}
                    </AppText>
                    <Button
                      title="✕"
                      variant="ghost"
                      accessibilityLabel={`Remove ${item.name}`}
                      onPress={() => removeItem.mutate(item.id)}
                    />
                  </View>
                ))}
                <TextField
                  label="New reward"
                  value={name}
                  onChangeText={setName}
                  placeholder="30 minutes of screen time"
                  maxLength={60}
                />
                <TextField
                  label="Cost in points"
                  value={cost}
                  onChangeText={setCost}
                  placeholder="50"
                  keyboardType="number-pad"
                  inputMode="numeric"
                />
                <ErrorText message={errorMessage(addItem.error)} />
                <Button
                  title="Add reward"
                  variant="secondary"
                  onPress={() => addItem.mutate()}
                  loading={addItem.isPending}
                  disabled={name.trim() === "" || parsedCost === null || parsedCost === 0}
                />
              </Section>
            )}
          </>
        )
      )}
    </Screen>
  );
}
