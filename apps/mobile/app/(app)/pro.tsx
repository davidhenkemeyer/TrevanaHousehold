/**
 * Tenara Pro (parents): the family's plan, what Pro adds, and buying it.
 *
 * Prices come from the store (so they're in the family's currency). After a
 * purchase or restore the API confirms with RevenueCat, and the family's plan
 * (and every lock in the app) updates from that answer. Kids never see this.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { GradientHeader } from "../../src/components/brand";
import { BackLink, Section } from "../../src/components/forms";
import { Screen, errorMessage } from "../../src/components/Screen";
import { AppText, Button, Card, ErrorText } from "../../src/components/ui";
import { BASIC_INCLUDES, PRO_PERKS, planHeadline, yearlyLabel } from "../../src/features/pro/plan";
import { usePlan } from "../../src/features/pro/ProBadge";
import {
  buy,
  loadPackages,
  manage,
  purchasesAvailable,
  restore,
} from "../../src/features/pro/purchases";
import { useApi, useFamily } from "../../src/state/AppProvider";
import { colors, spacing } from "../../src/theme";

export default function Pro() {
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { familyId, role } = useFamily();
  const plan = usePlan();
  const available = purchasesAvailable();

  const packages = useQuery({
    queryKey: ["proPackages", familyId],
    queryFn: () => loadPackages(familyId!),
    enabled: familyId !== undefined && available && role === "PARENT",
    staleTime: 60 * 60_000,
  });

  /** Asks the API to confirm with RevenueCat, then refreshes everything that depends on the plan. */
  const confirm = async () => {
    await api.refreshBilling(familyId!);
    await queryClient.invalidateQueries({ queryKey: ["family", familyId] });
  };
  const purchase = useMutation({
    mutationFn: async (pkg: PurchasesPackage) => {
      if (await buy(familyId!, pkg)) await confirm();
    },
  });
  const restoring = useMutation({
    mutationFn: async () => {
      await restore(familyId!);
      await confirm();
    },
  });
  const managing = useMutation({ mutationFn: () => manage(familyId!) });

  const subscribed = plan?.reason === "SUBSCRIPTION";
  const monthly = packages.data?.monthly;
  const yearly = packages.data?.yearly;
  const perMonth = yearly?.product.pricePerMonthString ?? null;
  const busy = purchase.isPending || restoring.isPending;

  return (
    <Screen
      header={
        <GradientHeader>
          <BackLink onPress={() => router.back()} />
          <AppText variant="h1" color={colors.onPrimary} accessibilityRole="header">
            Tenara Pro
          </AppText>
          {plan && <AppText color={colors.onPrimary}>{planHeadline(plan, new Date())}</AppText>}
        </GradientHeader>
      }
    >
      {role !== "PARENT" ? (
        <AppText color={colors.textMuted}>Ask a parent about Tenara Pro.</AppText>
      ) : (
        <>
          <Section title="Pro adds">
            {PRO_PERKS.map((perk) => (
              <View key={perk.title} style={{ gap: spacing.xxs }}>
                <AppText variant="bodyStrong">{perk.title}</AppText>
                <AppText color={colors.textMuted}>{perk.detail}</AppText>
              </View>
            ))}
          </Section>

          {subscribed ? (
            <Card style={{ gap: spacing.sm }}>
              <AppText variant="h2">You're on Pro. Thank you!</AppText>
              <AppText color={colors.textMuted}>
                One subscription covers the whole family, whoever bought it.
              </AppText>
              {available && (
                <Button
                  title="Manage subscription"
                  variant="secondary"
                  onPress={() => managing.mutate()}
                  loading={managing.isPending}
                />
              )}
            </Card>
          ) : !available ? (
            <Card style={{ gap: spacing.sm }}>
              <AppText color={colors.textMuted}>
                Purchases aren't set up in this build of the app yet.
              </AppText>
            </Card>
          ) : (
            <Card style={{ gap: spacing.md }}>
              <AppText variant="h2">
                {plan?.reason === "TRIAL" ? "Keep Pro after your trial" : "Get Pro"}
              </AppText>
              <ErrorText message={errorMessage(packages.error)} />
              {yearly && (
                <Button
                  title={yearlyLabel(yearly.product.priceString, perMonth)}
                  onPress={() => purchase.mutate(yearly)}
                  disabled={busy}
                  loading={purchase.isPending && purchase.variables === yearly}
                />
              )}
              {monthly && (
                <Button
                  title={`${monthly.product.priceString} a month`}
                  variant="secondary"
                  onPress={() => purchase.mutate(monthly)}
                  disabled={busy}
                  loading={purchase.isPending && purchase.variables === monthly}
                />
              )}
              <AppText variant="caption" color={colors.textMuted}>
                One subscription covers the whole family. Cancel any time; if Pro ends, nothing is
                deleted and everyone keeps what they've earned.
              </AppText>
              <Button
                title="Restore purchases"
                variant="ghost"
                onPress={() => restoring.mutate()}
                loading={restoring.isPending}
                disabled={busy}
              />
            </Card>
          )}
          <ErrorText message={errorMessage(purchase.error ?? restoring.error ?? managing.error)} />

          <Section title="Basic, free forever">
            {BASIC_INCLUDES.map((line) => (
              <AppText key={line} color={colors.textMuted}>
                {`• ${line}`}
              </AppText>
            ))}
          </Section>
        </>
      )}
    </Screen>
  );
}
