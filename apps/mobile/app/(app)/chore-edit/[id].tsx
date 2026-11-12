/**
 * Chore editor (parents): create a chore (`/chore-edit/new`) or edit one.
 *
 * Sections follow how a parent thinks about a chore: what it is, when it
 * happens, when it's due, who does it, what "done" means (checklist), and how
 * it's checked. The schedule line ("Every week on Mon, Thu") updates live
 * from the same domain function the rest of the app uses. Validation runs
 * the API's own schema (features/chores/form.ts); the server has the final say.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Chore, Member } from "@tenara/contracts";
import {
  FREQUENCIES,
  type Frequency,
  type PlainDate,
  addDays,
  describeRecurrence,
  formatShortDate,
  formatTime12h,
  instantToPlainDate,
  MAX_XP_OVERRIDE,
  MIN_XP,
  ordinal,
  weekdayOf,
  xpFor,
} from "@tenara/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { GradientHeader } from "../../../src/components/brand";
import {
  BackLink,
  ChoiceChips,
  FieldError,
  FieldLabel,
  Section,
  SelectChip,
  Sheet,
  Stepper,
  ToggleRow,
} from "../../../src/components/forms";
import { Screen, errorMessage } from "../../../src/components/Screen";
import { AppText, Button, ErrorText, TextField } from "../../../src/components/ui";
import {
  type ChoreForm,
  DEADLINE_PRESETS,
  describeDuration,
  endOfDayMinutes,
  formFromChore,
  minutesToTime,
  newChoreForm,
  timeToMinutes,
  toChoreBody,
  toRecurrence,
  toUpdateBody,
  validateChoreForm,
} from "../../../src/features/chores/form";
import {
  type PickedItem,
  PhotoPicker,
  isUploading,
  readyUploadIds,
} from "../../../src/features/photos/PhotoPicker";
import { PhotoThumb } from "../../../src/features/photos/PhotoViews";
import { amountInputValue, parseAmountInput } from "../../../src/features/rewards/format";
import { invalidateRewards, useRewards } from "../../../src/features/rewards/useRewards";
import { useApi, useFamily } from "../../../src/state/AppProvider";
import { colors, spacing } from "../../../src/theme";

const FREQ_LABEL: Record<Frequency, string> = {
  ONCE: "Once",
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  ANNUAL: "Yearly",
};
const INTERVAL_UNIT: Record<Frequency, [string, string]> = {
  ONCE: ["", ""],
  DAILY: ["day", "days"],
  WEEKLY: ["week", "weeks"],
  MONTHLY: ["month", "months"],
  QUARTERLY: ["quarter", "quarters"],
  ANNUAL: ["year", "years"],
};
/** Monday first; values are 0 (Sun) – 6 (Sat). */
const WEEKDAY_CHIPS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];
const EFFORT_CHOICES = [5, 10, 15, 20, 30, 45, 60];
const CUE_SUGGESTIONS = ["After school", "After dinner", "Before bed", "Saturday morning"];
const ASSIGN_HINT = {
  FIXED: "Everyone you pick does it together, and the time is split between them.",
  ROTATE:
    "The next person takes it each time, in the order you pick them. Pick nobody for everyone.",
  AUTO: "Goes to whoever has the most free time that day. Pick nobody for everyone.",
  OPEN: "Goes on the job board; whoever claims it first does it. Pick who may claim it, or nobody for everyone.",
} as const;
const REVIEW_HINT = {
  REVIEW_EACH: "You look at every one. Good for chores that earn a reward.",
  BATCH_OK: 'You check it, but it\'s included in "Approve all low-stakes".',
  AUTO_APPROVE: "Counts as done as soon as it's marked done.",
} as const;
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const longDate = (date: PlainDate) => `${WEEKDAY_SHORT[weekdayOf(date)]}, ${formatShortDate(date)}`;

export default function ChoreEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { familyId, family } = useFamily();
  const timeZone = family.data?.family.timeZone;
  const members = family.data?.members ?? [];
  const rewards = useRewards();
  // The currency a reward can be typed in; null while rewards are off.
  const coin =
    rewards.currency === "MONEY" || rewards.currency === "POINTS" ? rewards.currency : null;

  const existing = useQuery({
    queryKey: ["chores", familyId, "one", id],
    queryFn: () => api.chore(familyId!, id),
    enabled: familyId !== undefined && !isNew && typeof id === "string",
  });

  const [form, setForm] = useState<ChoreForm | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  // Reference photo: a newly picked one (uploads right away), or removal of the current one.
  const [newReference, setNewReference] = useState<PickedItem[]>([]);
  const [removeReference, setRemoveReference] = useState(false);
  // The reward as typed ("2.50" or "50"), and whether a routine is paid on purpose.
  const [rewardText, setRewardText] = useState("");
  const [payRoutine, setPayRoutine] = useState(false);

  // Fill the form once: a blank chore starting today, or the loaded chore.
  useEffect(() => {
    if (form !== null || !timeZone) return;
    if (isNew) setForm(newChoreForm(instantToPlainDate(new Date(), timeZone)));
    if (!isNew && existing.data) {
      setForm(formFromChore(existing.data));
      setPayRoutine(existing.data.rewardAmount > 0);
      if (coin) setRewardText(amountInputValue(coin, existing.data.rewardAmount));
    }
  }, [form, isNew, timeZone, existing.data, coin]);

  const done = () => {
    for (const key of ["chores", "agenda", "weekLoad", "instance"]) {
      void queryClient.invalidateQueries({ queryKey: [key, familyId] });
    }
    invalidateRewards(queryClient, familyId);
    router.back();
  };

  const save = useMutation({
    mutationFn: async ({ f, original }: { f: ChoreForm; original: Chore | undefined }) => {
      if (original === undefined) return api.createChore(familyId!, toChoreBody(f));
      const changes = toUpdateBody(f, original);
      // Nothing changed: don't re-plan anyone's chores for nothing.
      if (Object.keys(changes).length === 0) return original;
      return api.updateChore(familyId!, original.id, changes);
    },
    onSuccess: done,
  });
  const archive = useMutation({
    mutationFn: () => api.archiveChore(familyId!, id),
    onSuccess: done,
  });

  const header = (
    <GradientHeader>
      <BackLink onPress={() => router.back()} />
      <AppText variant="h1" color={colors.onPrimary} accessibilityRole="header">
        {isNew ? "New chore" : (existing.data?.name ?? "Edit chore")}
      </AppText>
    </GradientHeader>
  );

  if (!form) {
    return (
      <Screen header={header}>
        <ErrorText message={errorMessage(existing.error)} />
      </Screen>
    );
  }

  const update = (patch: Partial<ChoreForm>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const errors = validateChoreForm(form);
  const shown = showErrors ? errors : {};
  const hasErrors = Object.keys(errors).length > 0;
  const deadline = form.deadline;
  const customDeadline =
    deadline.kind === "minutes" && !DEADLINE_PRESETS.some((p) => p.minutes === deadline.minutes)
      ? deadline.minutes
      : null;
  const deadlineChoice =
    deadline.kind === "endOfDay"
      ? "end"
      : customDeadline !== null
        ? "custom"
        : String(deadline.minutes);
  const referenceUploadId = readyUploadIds(newReference)[0];
  const referenceUploading = isUploading(newReference);
  const currentReference = removeReference ? null : (existing.data?.referencePhotoUrl ?? null);
  // Routines aren't paid unless a parent chooses to; extra jobs are.
  const pays = coin !== null && (form.kind === "EXTRA_JOB" || payRoutine);
  const typedReward =
    coin === null
      ? form.rewardAmount
      : rewardText.trim() === ""
        ? 0
        : parseAmountInput(coin, rewardText);
  const rewardError =
    pays && typedReward === null
      ? coin === "MONEY"
        ? "Enter an amount, like 5 or 2.50."
        : "Enter whole points, like 50."
      : undefined;
  const onSave = () => {
    setShowErrors(true);
    if (hasErrors || referenceUploading || rewardError !== undefined) return;
    // With rewards off, whatever reward the chore already had is left alone.
    const rewardAmount = coin === null ? form.rewardAmount : pays ? (typedReward ?? 0) : 0;
    const referencePhoto: ChoreForm["referencePhoto"] =
      referenceUploadId !== undefined
        ? { kind: "new", uploadId: referenceUploadId }
        : removeReference
          ? { kind: "remove" }
          : { kind: "unchanged" };
    save.mutate({ f: { ...form, rewardAmount, referencePhoto }, original: existing.data });
  };

  return (
    <Screen header={header}>
      <Section
        title="What"
        hint={
          form.kind === "ROUTINE"
            ? "A routine is part of everyday family life: making beds, clearing the table."
            : "An extra job is optional work someone can take on to earn a reward."
        }
      >
        <ChoiceChips
          options={[
            { value: "ROUTINE", label: "Routine" },
            { value: "EXTRA_JOB", label: "Extra job" },
          ]}
          value={form.kind}
          onChange={(kind) => update({ kind })}
        />
        <TextField
          label="Name"
          value={form.name}
          onChangeText={(name) => update({ name })}
          placeholder="Feed the dog"
          maxLength={80}
          error={shown.name}
        />
        <TextField
          label="Details (optional)"
          value={form.description}
          onChangeText={(description) => update({ description })}
          placeholder="One scoop of food, fresh water"
          multiline
          maxLength={500}
        />
        <TextField
          label="When it happens (optional)"
          value={form.cue}
          onChangeText={(cue) => update({ cue })}
          placeholder="After dinner"
          maxLength={60}
          error={shown.cue}
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {CUE_SUGGESTIONS.map((cue) => (
            <SelectChip
              key={cue}
              label={cue}
              selected={form.cue === cue}
              onPress={() => update({ cue: form.cue === cue ? "" : cue })}
            />
          ))}
        </View>
        <FieldLabel>How long it takes</FieldLabel>
        <ChoiceChips
          options={EFFORT_CHOICES.map((m) => ({ value: m, label: `${m} min` }))}
          value={form.effortMinutes}
          onChange={(effortMinutes) => update({ effortMinutes })}
        />
        <Stepper
          label="Minutes"
          display={`${form.effortMinutes} min`}
          onDecrement={() => update({ effortMinutes: Math.max(1, form.effortMinutes - 5) })}
          onIncrement={() => update({ effortMinutes: Math.min(480, form.effortMinutes + 5) })}
          canDecrement={form.effortMinutes > 1}
          canIncrement={form.effortMinutes < 480}
        />
        <FieldError message={shown.effortMinutes} />
        <FieldLabel>Priority</FieldLabel>
        <ChoiceChips
          options={[
            { value: "LOW", label: "Low" },
            { value: "NORMAL", label: "Normal" },
            { value: "HIGH", label: "High" },
          ]}
          value={form.defaultPriority}
          onChange={(defaultPriority) => update({ defaultPriority })}
        />
      </Section>

      <Section title="When">
        <ChoiceChips
          options={FREQUENCIES.map((f) => ({ value: f, label: FREQ_LABEL[f] }))}
          value={form.freq}
          onChange={(freq) => update({ freq })}
        />
        {form.freq !== "ONCE" && (
          <Stepper
            label="Repeats every"
            display={`${form.interval} ${INTERVAL_UNIT[form.freq][form.interval === 1 ? 0 : 1]}`}
            onDecrement={() => update({ interval: Math.max(1, form.interval - 1) })}
            onIncrement={() => update({ interval: Math.min(365, form.interval + 1) })}
            canDecrement={form.interval > 1}
          />
        )}
        {form.freq === "WEEKLY" && (
          <>
            <FieldLabel>On these days</FieldLabel>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {WEEKDAY_CHIPS.map((d) => {
                const on = form.byWeekday.includes(d.value);
                return (
                  <SelectChip
                    key={d.value}
                    label={d.label}
                    selected={on}
                    onPress={() =>
                      update({
                        byWeekday: on
                          ? form.byWeekday.filter((x) => x !== d.value)
                          : [...form.byWeekday, d.value],
                      })
                    }
                  />
                );
              })}
            </View>
          </>
        )}
        {(form.freq === "MONTHLY" || form.freq === "QUARTERLY" || form.freq === "ANNUAL") && (
          <Stepper
            label="Day of the month"
            display={form.monthDay === -1 ? "Last day" : ordinal(form.monthDay)}
            // Order: 1st … 31st, then "Last day".
            onDecrement={() =>
              update({ monthDay: form.monthDay === -1 ? 31 : Math.max(1, form.monthDay - 1) })
            }
            onIncrement={() => update({ monthDay: form.monthDay === 31 ? -1 : form.monthDay + 1 })}
            canDecrement={form.monthDay !== 1}
            canIncrement={form.monthDay !== -1}
          />
        )}
        <DateStepper
          label={form.freq === "ONCE" ? "On" : "Starting"}
          value={form.startDate}
          onChange={(startDate) => update({ startDate })}
        />
        <Stepper
          label="Available from"
          display={form.timeOfDay === "00:00" ? "Start of day" : formatTime12h(form.timeOfDay)}
          onDecrement={() =>
            update({ timeOfDay: minutesToTime(timeToMinutes(form.timeOfDay) - 30) })
          }
          onIncrement={() =>
            update({ timeOfDay: minutesToTime(timeToMinutes(form.timeOfDay) + 30) })
          }
          canDecrement={form.timeOfDay !== "00:00"}
          canIncrement={timeToMinutes(form.timeOfDay) < 23 * 60 + 30}
        />
        {form.freq !== "ONCE" && (
          <>
            <ToggleRow
              label="Stops on a date"
              value={form.endDate !== null}
              onChange={(on) => update({ endDate: on ? addDays(form.startDate, 30) : null })}
            />
            {form.endDate !== null && (
              <DateStepper
                label="Last day"
                value={form.endDate}
                onChange={(endDate) => update({ endDate })}
              />
            )}
          </>
        )}
        <AppText variant="bodyStrong" color={colors.primary} accessibilityRole="text">
          {describeRecurrence(toRecurrence(form))}
        </AppText>
        <FieldError message={shown.recurrence} />
      </Section>

      <Section
        title="Due"
        hint={`${describeDuration(toChoreBody(form).deadlineMinutes)} after it becomes available.`}
      >
        <ChoiceChips
          options={[
            { value: "end", label: "End of the day" },
            ...DEADLINE_PRESETS.map((p) => ({ value: String(p.minutes), label: p.label })),
            // A deadline set some other way (e.g. through the API) stays selectable.
            ...(customDeadline !== null
              ? [{ value: "custom", label: describeDuration(customDeadline) }]
              : []),
          ]}
          value={deadlineChoice}
          onChange={(v) => {
            if (v === "end") update({ deadline: { kind: "endOfDay" } });
            else if (v !== "custom") update({ deadline: { kind: "minutes", minutes: Number(v) } });
          }}
        />
        {form.deadline.kind === "endOfDay" && endOfDayMinutes(form.timeOfDay) < 60 && (
          <AppText variant="caption" color={colors.attention}>
            That leaves less than an hour. Consider an earlier start or a longer deadline.
          </AppText>
        )}
        <FieldError message={shown.deadlineMinutes} />
      </Section>

      <Section title="Who" hint={ASSIGN_HINT[form.assignMode]}>
        <ChoiceChips
          options={[
            { value: "AUTO", label: "Balance by time" },
            { value: "ROTATE", label: "Take turns" },
            { value: "FIXED", label: "Always the same" },
            { value: "OPEN", label: "Job board" },
          ]}
          value={form.assignMode}
          onChange={(assignMode) => update({ assignMode })}
        />
        <MemberPicker
          members={members}
          selected={form.eligibleMembershipIds}
          numbered={form.assignMode === "ROTATE"}
          onChange={(eligibleMembershipIds) => update({ eligibleMembershipIds })}
        />
        <FieldError message={shown.eligibleMembershipIds} />
      </Section>

      <Section
        title="Steps"
        hint={
          form.checklist.length === 0
            ? 'Optional. A short checklist (3 to 5 steps) shows what "done" means.'
            : "Kids check these off. They can send it in with some unchecked; you decide."
        }
      >
        <ChecklistEditor steps={form.checklist} onChange={(checklist) => update({ checklist })} />
        <FieldError message={shown.checklist} />
      </Section>

      <Section
        title="Reference photo"
        hint="Optional. Shows kids what done looks like, and sits next to their photo when you review."
      >
        {newReference.length === 0 && currentReference !== null && (
          <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "center" }}>
            <PhotoThumb url={currentReference} accessibilityLabel="Current reference photo" />
            <Button
              title="Remove"
              variant="ghost"
              accessibilityLabel="Remove reference photo"
              onPress={() => setRemoveReference(true)}
            />
          </View>
        )}
        <PhotoPicker purpose="REFERENCE" max={1} items={newReference} onChange={setNewReference} />
      </Section>

      <Section title="Checking it" hint={REVIEW_HINT[form.reviewPolicy]}>
        <ChoiceChips
          options={[
            { value: "REVIEW_EACH", label: "Review each" },
            { value: "BATCH_OK", label: "OK to batch" },
            { value: "AUTO_APPROVE", label: "No review" },
          ]}
          value={form.reviewPolicy}
          onChange={(reviewPolicy) => update({ reviewPolicy })}
        />
        <ToggleRow
          label="Needs a photo"
          hint="Kids add a photo when they finish. (A parent marking it done doesn't need one.)"
          value={form.requiresPhoto}
          onChange={(requiresPhoto) => update({ requiresPhoto })}
        />
      </Section>

      <Section
        title="Reward"
        hint={
          coin === null
            ? "Rewards are off for your family. Turn them on in Rewards settings and chores can earn money or points."
            : form.kind === "EXTRA_JOB"
              ? "What finishing this job earns, once you've approved it."
              : "Routines usually aren't paid, so kids do them because they're part of the family, not for the money."
        }
      >
        <ToggleRow
          label={`${form.xpOverride ?? xpFor(form.effortMinutes)} XP`}
          hint={
            form.xpOverride === null
              ? `From effort: 1 XP per minute (at least ${MIN_XP}). Turn on to set your own.`
              : "A custom amount. Turn off to use 1 XP per minute again."
          }
          value={form.xpOverride !== null}
          onChange={(on) => update({ xpOverride: on ? xpFor(form.effortMinutes) : null })}
        />
        {form.xpOverride !== null && (
          <Stepper
            label="Custom XP"
            display={`${form.xpOverride} XP`}
            onDecrement={() => update({ xpOverride: Math.max(1, (form.xpOverride ?? 5) - 5) })}
            onIncrement={() =>
              update({ xpOverride: Math.min(MAX_XP_OVERRIDE, (form.xpOverride ?? 0) + 5) })
            }
            canDecrement={form.xpOverride > 1}
            canIncrement={form.xpOverride < MAX_XP_OVERRIDE}
          />
        )}
        {coin === null ? (
          <Button
            title="Rewards settings"
            variant="secondary"
            onPress={() => router.push("/rewards-settings")}
          />
        ) : (
          <>
            {form.kind === "ROUTINE" && (
              <ToggleRow
                label="Also pay for this routine"
                value={payRoutine}
                onChange={setPayRoutine}
              />
            )}
            {pays && (
              <TextField
                label={coin === "MONEY" ? `Amount (${rewards.currencyCode ?? "USD"})` : "Points"}
                value={rewardText}
                onChangeText={setRewardText}
                placeholder={coin === "MONEY" ? "0.00" : "0"}
                keyboardType={coin === "MONEY" ? "decimal-pad" : "number-pad"}
                inputMode={coin === "MONEY" ? "decimal" : "numeric"}
                error={showErrors ? rewardError : undefined}
              />
            )}
          </>
        )}
      </Section>

      {showErrors && hasErrors && (
        <ErrorText message="Some things need fixing; see the notes above." />
      )}
      <ErrorText message={errorMessage(save.error)} />
      <Button
        title={referenceUploading ? "Uploading photo…" : isNew ? "Add chore" : "Save changes"}
        disabled={referenceUploading}
        onPress={onSave}
        loading={save.isPending}
      />
      {!isNew && existing.data?.active && (
        <Button
          title="Archive this chore"
          variant="ghost"
          onPress={() => {
            archive.reset();
            setConfirmArchive(true);
          }}
        />
      )}

      <Sheet visible={confirmArchive} onClose={() => setConfirmArchive(false)}>
        <AppText variant="h2">{`Archive "${form.name}"?`}</AppText>
        <AppText color={colors.textMuted}>
          It stops appearing on anyone's list. Chores already done, or in progress, stay in the
          history.
        </AppText>
        <ErrorText message={errorMessage(archive.error)} />
        <Button title="Archive" onPress={() => archive.mutate()} loading={archive.isPending} />
        <Button title="Keep it" variant="ghost" onPress={() => setConfirmArchive(false)} />
      </Sheet>
    </Screen>
  );
}

/** "‹ Tue, Nov 10, 2026 ›": a day at a time, with no native date picker needed. */
function DateStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: PlainDate;
  onChange: (date: PlainDate) => void;
}) {
  return (
    <Stepper
      label={label}
      display={longDate(value)}
      onDecrement={() => onChange(addDays(value, -1))}
      onIncrement={() => onChange(addDays(value, 1))}
    />
  );
}

/** Pick members; for "take turns" the pick order is the rotation order, shown as numbers. */
function MemberPicker({
  members,
  selected,
  numbered,
  onChange,
}: {
  members: readonly Member[];
  selected: readonly string[];
  numbered: boolean;
  onChange: (ids: string[]) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {members.map((m) => {
        const index = selected.indexOf(m.id);
        const on = index !== -1;
        return (
          <SelectChip
            key={m.id}
            label={numbered && on ? `${index + 1}. ${m.displayName}` : m.displayName}
            accessibilityLabel={m.displayName}
            selected={on}
            onPress={() => onChange(on ? selected.filter((x) => x !== m.id) : [...selected, m.id])}
          />
        );
      })}
    </View>
  );
}

function ChecklistEditor({
  steps,
  onChange,
}: {
  steps: readonly string[];
  onChange: (steps: string[]) => void;
}) {
  const set = (i: number, text: string) => onChange(steps.map((s, j) => (j === i ? text : s)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...steps];
    const [item] = next.splice(i, 1);
    if (item === undefined) return;
    next.splice(i + by, 0, item);
    onChange(next);
  };
  return (
    <View style={{ gap: spacing.sm }}>
      {steps.map((step, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing.xs }}>
          <View style={{ flex: 1 }}>
            <TextField
              label={`Step ${i + 1}`}
              value={step}
              onChangeText={(text) => set(i, text)}
              maxLength={120}
            />
          </View>
          <IconButton
            label={`Move step ${i + 1} up`}
            symbol="↑"
            disabled={i === 0}
            onPress={() => move(i, -1)}
          />
          <IconButton
            label={`Move step ${i + 1} down`}
            symbol="↓"
            disabled={i === steps.length - 1}
            onPress={() => move(i, 1)}
          />
          <IconButton
            label={`Remove step ${i + 1}`}
            symbol="✕"
            onPress={() => onChange(steps.filter((_, j) => j !== i))}
          />
        </View>
      ))}
      {steps.length < 20 && (
        <Button title="Add a step" variant="secondary" onPress={() => onChange([...steps, ""])} />
      )}
    </View>
  );
}

function IconButton({
  label,
  symbol,
  onPress,
  disabled = false,
}: {
  label: string;
  symbol: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: 40,
        height: 48,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.3 : 1,
      }}
    >
      <AppText variant="bodyStrong" color={colors.textMuted}>
        {symbol}
      </AppText>
    </Pressable>
  );
}
