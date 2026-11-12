/**
 * Rewards: one person's balance, what's waiting for review, and the history
 * behind it. `/rewards` shows your own; a parent can open a kid's with
 * `/rewards?member=<membershipId>`.
 *
 *  - Points: the catalog ("Ask for this") and your requests.
 *  - Parents: everyone's balances, "Record payout" (money), and "Correction"
 *    (always with a note; the only way an amount is ever taken back).
 *
 * The API decides who may see and do what; this screen shows its answers.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MemberRewards } from "@tenara/contracts";
import { type CoinCurrency, formatAmount } from "@tenara/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { GradientHeader } from "../../src/components/brand";
import { BackLink, Segmented, Sheet } from "../../src/components/forms";
import { Screen, errorMessage } from "../../src/components/Screen";
import { AppText, Avatar, Button, Card, Chip, ErrorText, TextField } from "../../src/components/ui";
import { describeEntry, parseAmountInput, signedAmount } from "../../src/features/rewards/format";
import { BadgeGrid, LevelCard } from "../../src/features/progress/ProgressViews";
import { useProgress } from "../../src/features/progress/useProgress";
import { invalidateRewards, useRewards } from "../../src/features/rewards/useRewards";
import { useApi, useFamily } from "../../src/state/AppProvider";
import { colors, spacing } from "../../src/theme";

type Entry =
  { kind: "payout" } | { kind: "correction"; currency: CoinCurrency; code: string | null };

const day = (iso: string) =>
  new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

export default function Rewards() {
  const { member: memberParam } = useLocalSearchParams<{ member?: string }>();
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { familyId, membershipId, role } = useFamily();
  const isParent = role === "PARENT";
  const rewards = useRewards();
  const { currency, currencyCode, format } = rewards;

  const memberId = typeof memberParam === "string" ? memberParam : membershipId;
  const isSelf = memberId === membershipId;
  const row: MemberRewards | undefined = rewards.summary.data?.members.find(
    (m) => m.member.membershipId === memberId,
  );
  const [entry, setEntry] = useState<Entry | null>(null);
  const gamify = useProgress();
  const progressRow = gamify.query.data?.members.find((m) => m.member.membershipId === memberId);

  const ledger = useInfiniteQuery({
    queryKey: ["ledger", familyId, memberId],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      api.ledger(familyId!, {
        ...(memberId !== undefined && { memberId }),
        ...(pageParam !== undefined && { cursor: pageParam }),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: familyId !== undefined && memberId !== undefined,
  });
  const history = ledger.data?.pages.flatMap((p) => p.items) ?? [];

  const usingPoints = currency === "POINTS";
  const catalog = useQuery({
    queryKey: ["rewardItems", familyId],
    queryFn: () => api.rewardItems(familyId!),
    enabled: familyId !== undefined && usingPoints,
  });
  const requests = useQuery({
    queryKey: ["redemptions", familyId, "all"],
    queryFn: () => api.redemptions(familyId!),
    enabled: familyId !== undefined && usingPoints,
  });
  const theirRequests = (requests.data?.items ?? []).filter(
    (r) => r.member.membershipId === memberId,
  );

  const refresh = () => invalidateRewards(queryClient, familyId);
  const ask = useMutation({
    mutationFn: (itemId: string) => api.requestRedemption(familyId!, itemId),
    onSettled: refresh,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.cancelRedemption(familyId!, id),
    onSettled: refresh,
  });

  const name = row?.member.displayName ?? "";
  return (
    <Screen
      header={
        <GradientHeader>
          <BackLink onPress={() => router.back()} />
          <AppText variant="h1" color={colors.onPrimary} accessibilityRole="header">
            {isSelf ? "My progress" : `${name || progressRow?.member.displayName || ""}'s progress`}
          </AppText>
          {format && row && (
            <>
              <AppText
                variant="display"
                color={colors.onPrimary}
                accessibilityLabel={`Balance: ${format(row.balance)}`}
              >
                {format(row.balance)}
              </AppText>
              {row.pending > 0 && (
                <AppText color={colors.onPrimary}>
                  {`${format(row.pending)} waiting for review`}
                </AppText>
              )}
              {row.balance < 0 && (
                <AppText color={colors.onPrimary}>
                  Paid ahead: the next rewards go toward this first.
                </AppText>
              )}
            </>
          )}
        </GradientHeader>
      }
    >
      <ErrorText
        message={errorMessage(rewards.summary.error ?? ledger.error ?? ask.error ?? cancel.error)}
      />

      {gamify.enabled && progressRow && gamify.query.data && (
        <View style={{ gap: spacing.md }}>
          <LevelCard progress={progressRow} />
          <AppText variant="bodyStrong" color={colors.textMuted} accessibilityRole="header">
            {`Badges · ${progressRow.badges.length}`}
          </AppText>
          <BadgeGrid earned={progressRow.badges} all={gamify.query.data.allBadges} />
        </View>
      )}

      {currency === "NONE" && (
        <Card style={{ gap: spacing.md }}>
          <AppText variant="h2">Rewards are off</AppText>
          <AppText color={colors.textMuted}>
            {isParent
              ? "Chores can earn real money or points. Turn rewards on to start."
              : "Your family isn't using rewards right now."}
          </AppText>
          {isParent && (
            <Button title="Set up rewards" onPress={() => router.push("/rewards-settings")} />
          )}
        </Card>
      )}

      {isParent && row && currency !== undefined && currency !== "NONE" && (
        <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
          {currency === "MONEY" && (
            <Button title="Record payout" onPress={() => setEntry({ kind: "payout" })} />
          )}
          <Button
            title="Correction"
            variant="secondary"
            onPress={() =>
              setEntry({
                kind: "correction",
                currency,
                code: currency === "MONEY" ? (currencyCode ?? null) : null,
              })
            }
          />
        </View>
      )}

      {/* Balances left in a currency the family used before. */}
      {row?.otherBalances.map((other) => (
        <Card key={`${other.currency}-${other.currencyCode}`} style={{ gap: spacing.sm }}>
          <AppText variant="bodyStrong">
            {`Also: ${formatAmount(other.currency, other.currencyCode, other.balance)}`}
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            From before your family changed how rewards work. It stays here until it's settled.
          </AppText>
          {isParent && (
            <Button
              title="Settle with a correction"
              variant="ghost"
              style={{ alignSelf: "flex-start" }}
              onPress={() =>
                setEntry({ kind: "correction", currency: other.currency, code: other.currencyCode })
              }
            />
          )}
        </Card>
      ))}

      {usingPoints && format && (
        <View style={{ gap: spacing.md }}>
          <AppText variant="bodyStrong" color={colors.textMuted} accessibilityRole="header">
            Rewards to choose from
          </AppText>
          {catalog.isSuccess && catalog.data.items.length === 0 && (
            <AppText color={colors.textMuted}>
              {isParent
                ? "Nothing yet. Add rewards in Rewards settings."
                : "Nothing yet. Ask a parent to add some."}
            </AppText>
          )}
          {catalog.data?.items.map((item) => {
            const affordable = (row?.balance ?? 0) >= item.cost;
            return (
              <Card
                key={item.id}
                style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
              >
                <View style={{ flex: 1, gap: spacing.xxs }}>
                  <AppText variant="bodyStrong">{item.name}</AppText>
                  <AppText variant="mono" color={colors.textMuted}>
                    {format(item.cost)}
                  </AppText>
                </View>
                {isSelf && (
                  <Button
                    title={affordable ? "Ask for this" : "Not enough yet"}
                    accessibilityLabel={`Ask for ${item.name}`}
                    variant="secondary"
                    disabled={!affordable}
                    loading={ask.isPending && ask.variables === item.id}
                    onPress={() => ask.mutate(item.id)}
                  />
                )}
              </Card>
            );
          })}
        </View>
      )}

      {theirRequests.length > 0 && format && (
        <View style={{ gap: spacing.md }}>
          <AppText variant="bodyStrong" color={colors.textMuted} accessibilityRole="header">
            Requests
          </AppText>
          {theirRequests.slice(0, 10).map((r) => (
            <Card key={r.id} style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <AppText variant="bodyStrong" style={{ flex: 1 }}>
                  {r.itemName}
                </AppText>
                <Chip
                  label={
                    r.status === "REQUESTED"
                      ? "WAITING"
                      : r.status === "APPROVED"
                        ? "APPROVED"
                        : r.status === "DENIED"
                          ? "NOT NOW"
                          : "CANCELED"
                  }
                  color={
                    r.status === "APPROVED"
                      ? colors.success
                      : r.status === "REQUESTED"
                        ? colors.info
                        : colors.textMuted
                  }
                />
              </View>
              <AppText variant="caption" color={colors.textMuted}>
                {`${format(r.cost)} · ${day(r.createdAt)}${r.note ? ` · ${r.note}` : ""}`}
              </AppText>
              {isSelf && r.status === "REQUESTED" && (
                <Button
                  title="Cancel request"
                  variant="ghost"
                  style={{ alignSelf: "flex-start" }}
                  loading={cancel.isPending && cancel.variables === r.id}
                  onPress={() => cancel.mutate(r.id)}
                />
              )}
            </Card>
          ))}
        </View>
      )}

      {/* Parents, on their own page: everyone at a glance. */}
      {isParent && isSelf && format && (rewards.summary.data?.members.length ?? 0) > 1 && (
        <View style={{ gap: spacing.md }}>
          <AppText variant="bodyStrong" color={colors.textMuted} accessibilityRole="header">
            Everyone
          </AppText>
          {rewards.summary.data?.members
            .filter((m) => m.member.membershipId !== membershipId)
            .map((m) => (
              <Pressable
                key={m.member.membershipId}
                accessibilityRole="button"
                accessibilityLabel={`${m.member.displayName}'s rewards`}
                onPress={() =>
                  router.push({ pathname: "/rewards", params: { member: m.member.membershipId } })
                }
              >
                <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                  <Avatar name={m.member.displayName} color={m.member.avatarColor} size={32} />
                  <AppText variant="bodyStrong" style={{ flex: 1 }}>
                    {m.member.displayName}
                  </AppText>
                  <View style={{ alignItems: "flex-end" }}>
                    <AppText variant="bodyStrong">{format(m.balance)}</AppText>
                    {m.pending > 0 && (
                      <AppText variant="caption" color={colors.textMuted}>
                        {`${format(m.pending)} waiting`}
                      </AppText>
                    )}
                  </View>
                </Card>
              </Pressable>
            ))}
          <Button
            title="Rewards settings"
            variant="ghost"
            onPress={() => router.push("/rewards-settings")}
          />
        </View>
      )}

      {history.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <AppText variant="bodyStrong" color={colors.textMuted} accessibilityRole="header">
            History
          </AppText>
          <Card style={{ gap: spacing.md }}>
            {history.map((e) => (
              <View key={e.id} style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ flex: 1, gap: spacing.xxs }}>
                  <AppText>{describeEntry(e)}</AppText>
                  <AppText variant="caption" color={colors.textMuted}>
                    {`${day(e.createdAt)}${e.createdBy ? ` · ${e.createdBy.displayName}` : ""}`}
                  </AppText>
                </View>
                <AppText variant="mono" color={e.amount >= 0 ? colors.success : colors.textMuted}>
                  {signedAmount((n) => formatAmount(e.currency, e.currencyCode, n), e.amount)}
                </AppText>
              </View>
            ))}
          </Card>
          {ledger.hasNextPage && (
            <Button
              title="Load more"
              variant="ghost"
              onPress={() => void ledger.fetchNextPage()}
              loading={ledger.isFetchingNextPage}
            />
          )}
        </View>
      )}
      {ledger.isSuccess && history.length === 0 && currency !== "NONE" && (
        <AppText color={colors.textMuted}>
          Nothing here yet. Rewards show up when a chore is approved.
        </AppText>
      )}

      <EntrySheet
        entry={entry}
        memberId={memberId}
        memberName={name}
        onClose={() => setEntry(null)}
        onDone={() => {
          setEntry(null);
          refresh();
        }}
      />
    </Screen>
  );
}

/** Record a payout, or a correction (which always needs a note). */
function EntrySheet({
  entry,
  memberId,
  memberName,
  onClose,
  onDone,
}: {
  entry: Entry | null;
  memberId: string | undefined;
  memberName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const api = useApi();
  const { familyId } = useFamily();
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [touched, setTouched] = useState(false);

  const currency: CoinCurrency = entry?.kind === "correction" ? entry.currency : "MONEY";
  const amount = parseAmountInput(currency, text);
  const reset = () => {
    setText("");
    setNote("");
    setDirection("add");
    setTouched(false);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!entry || amount === null || amount === 0 || memberId === undefined) return;
      const trimmed = note.trim();
      if (entry.kind === "payout") {
        await api.payout(familyId!, {
          memberId,
          amount,
          ...(trimmed !== "" && { note: trimmed }),
        });
      } else {
        await api.correction(familyId!, {
          memberId,
          currency: entry.currency,
          amount: direction === "add" ? amount : -amount,
          note: trimmed,
        });
      }
    },
    onSuccess: () => {
      reset();
      onDone();
    },
  });

  const isCorrection = entry?.kind === "correction";
  const amountError =
    touched && (amount === null || amount === 0) ? "Enter an amount, like 5 or 2.50." : undefined;
  const noteError =
    touched && isCorrection && note.trim() === "" ? "Say what you're correcting." : undefined;
  const submit = () => {
    setTouched(true);
    if (amount === null || amount === 0) return;
    if (isCorrection && note.trim() === "") return;
    save.mutate();
  };

  return (
    <Sheet
      visible={entry !== null}
      onClose={() => {
        reset();
        save.reset();
        onClose();
      }}
    >
      <View style={{ gap: spacing.xs }}>
        <AppText variant="h2">
          {isCorrection ? `Correct ${memberName}'s balance` : `Pay ${memberName}`}
        </AppText>
        <AppText color={colors.textMuted}>
          {isCorrection
            ? "For fixing a mistake. It shows in the history as a correction, with your note."
            : "Record money you've handed over. Paying more than the balance is fine: it counts as an advance."}
        </AppText>
      </View>
      {isCorrection && (
        <Segmented
          options={[
            { value: "add", label: "Add" },
            { value: "remove", label: "Take off" },
          ]}
          value={direction}
          onChange={setDirection}
        />
      )}
      <TextField
        label={currency === "MONEY" ? "Amount" : "Points"}
        value={text}
        onChangeText={setText}
        placeholder={currency === "MONEY" ? "0.00" : "0"}
        keyboardType={currency === "MONEY" ? "decimal-pad" : "number-pad"}
        inputMode={currency === "MONEY" ? "decimal" : "numeric"}
        error={amountError}
      />
      <TextField
        label={isCorrection ? "What happened" : "Note (optional)"}
        value={note}
        onChangeText={setNote}
        maxLength={200}
        error={noteError}
      />
      <ErrorText message={errorMessage(save.error)} />
      <Button
        title={isCorrection ? "Save correction" : "Record payout"}
        onPress={submit}
        loading={save.isPending}
      />
    </Sheet>
  );
}
