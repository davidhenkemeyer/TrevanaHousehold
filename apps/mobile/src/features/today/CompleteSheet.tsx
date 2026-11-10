/**
 * "Did you do everything?": the chore's checklist before submitting. Kids may
 * submit with steps unchecked (the parent sees "2/3" and decides).
 */
import type { Instance } from "@titan/contracts";
import { useEffect, useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import { AppText, Button, Card, Checkbox, ErrorText } from "../../components/ui";
import { colors, spacing } from "../../theme";

export function CompleteSheet({
  item,
  submitting,
  error,
  onSubmit,
  onClose,
}: {
  item: Instance | null;
  submitting: boolean;
  error: string | null;
  onSubmit: (checked: Record<string, boolean>) => void;
  onClose: () => void;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  useEffect(() => setChecked({}), [item?.id]);
  if (!item) return null;

  const done = item.checklist.filter((i) => checked[i.id]).length;
  const total = item.checklist.length;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View
        style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15, 23, 42, 0.5)" }}
      >
        <Card
          style={{
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            gap: spacing.lg,
            maxHeight: "85%",
          }}
        >
          <View style={{ gap: spacing.xs }}>
            <AppText variant="h2">{item.choreName}</AppText>
            <AppText color={colors.textMuted}>Check off each step you did.</AppText>
          </View>
          <ScrollView style={{ flexGrow: 0 }}>
            {item.checklist.map((step) => (
              <Checkbox
                key={step.id}
                label={step.text}
                checked={checked[step.id] ?? false}
                onToggle={() => setChecked((c) => ({ ...c, [step.id]: !c[step.id] }))}
              />
            ))}
          </ScrollView>
          <AppText variant="mono" color={done === total ? colors.success : colors.textMuted}>
            {`${done}/${total} steps`}
          </AppText>
          <ErrorText message={error} />
          <Button
            title={done === total ? "All done! ✓" : `Done (${done}/${total})`}
            onPress={() => onSubmit(checked)}
            loading={submitting}
          />
          <Button title="Not yet" variant="ghost" onPress={onClose} disabled={submitting} />
        </Card>
      </View>
    </Modal>
  );
}
