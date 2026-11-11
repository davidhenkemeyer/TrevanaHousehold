/**
 * Notification settings (your own): when the daily digest arrives, quiet
 * hours, and for each kind of notification: right away, in the daily digest,
 * or off (it's still in your inbox either way).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UpdateNotificationSettingsBody } from "@titan/contracts";
import { type Delivery, type NotificationType, formatTime12h } from "@titan/domain";
import { useRouter } from "expo-router";
import { Platform, View } from "react-native";
import { GradientHeader } from "../../src/components/brand";
import { BackLink, Section, SelectChip, Stepper } from "../../src/components/forms";
import { Screen, errorMessage } from "../../src/components/Screen";
import { AppText, ErrorText } from "../../src/components/ui";
import { minutesToTime, timeToMinutes } from "../../src/features/chores/form";
import { describeType, typesFor } from "../../src/features/notifications/settings";
import { useApi, useFamily } from "../../src/state/AppProvider";
import { colors, spacing } from "../../src/theme";

const DELIVERY_OPTIONS: { value: Delivery; label: string }[] = [
  { value: "INSTANT", label: "Right away" },
  { value: "DIGEST", label: "Daily digest" },
  { value: "OFF", label: "Off" },
];

/** Moves a time by 30 minutes, wrapping around midnight. */
const shift = (time: string, by: number) =>
  minutesToTime((((timeToMinutes(time) + by) % 1440) + 1440) % 1440);

export default function NotificationSettingsScreen() {
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { familyId, role } = useFamily();
  const key = ["notifications", familyId, "settings"];

  const settings = useQuery({
    queryKey: key,
    queryFn: () => api.notificationSettings(familyId!),
    enabled: familyId !== undefined,
  });
  const save = useMutation({
    mutationFn: (body: UpdateNotificationSettingsBody) =>
      api.updateNotificationSettings(familyId!, body),
    onSuccess: (next) => queryClient.setQueryData(key, next),
  });
  const s = settings.data;

  return (
    <Screen
      header={
        <GradientHeader>
          <BackLink onPress={() => router.back()} />
          <AppText variant="h1" color={colors.onPrimary} accessibilityRole="header">
            Notification settings
          </AppText>
        </GradientHeader>
      }
    >
      <ErrorText message={errorMessage(settings.error ?? save.error)} />
      {Platform.OS === "web" && (
        <AppText color={colors.textMuted}>
          On the web, notifications appear in your inbox. These settings also apply to your phone.
        </AppText>
      )}
      {s && (
        <>
          <Section
            title="Daily digest"
            hint="One message a day with your chores and what happened. Nothing is sent on a day with nothing to say."
          >
            <Stepper
              label="Arrives at"
              display={formatTime12h(s.digestTime)}
              onDecrement={() => save.mutate({ digestTime: shift(s.digestTime, -30) })}
              onIncrement={() => save.mutate({ digestTime: shift(s.digestTime, 30) })}
            />
          </Section>

          <Section
            title="Quiet hours"
            hint="Nothing is sent during these hours; anything that comes in waits until they end."
          >
            <Stepper
              label="From"
              display={formatTime12h(s.quietStart)}
              onDecrement={() => save.mutate({ quietStart: shift(s.quietStart, -30) })}
              onIncrement={() => save.mutate({ quietStart: shift(s.quietStart, 30) })}
            />
            <Stepper
              label="Until"
              display={formatTime12h(s.quietEnd)}
              onDecrement={() => save.mutate({ quietEnd: shift(s.quietEnd, -30) })}
              onIncrement={() => save.mutate({ quietEnd: shift(s.quietEnd, 30) })}
            />
          </Section>

          <Section
            title="What to send"
            hint='"Off" only stops the push; it still shows in your inbox.'
          >
            {typesFor(role ?? "CHILD").map((type: NotificationType) => (
              <View key={type} style={{ gap: spacing.xs }}>
                <AppText>{describeType(type)}</AppText>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                  {DELIVERY_OPTIONS.map((o) => (
                    <SelectChip
                      key={o.value}
                      label={o.label}
                      accessibilityLabel={`${describeType(type)}: ${o.label}`}
                      selected={s.byType[type] === o.value}
                      onPress={() => save.mutate({ byType: { [type]: o.value } })}
                    />
                  ))}
                </View>
              </View>
            ))}
          </Section>
        </>
      )}
    </Screen>
  );
}
