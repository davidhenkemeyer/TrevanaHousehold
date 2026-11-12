/**
 * "Needs work": send the chore back for another try (rework), or decline it
 * (reject: no credit, stays in the history). Either way the kid sees the note.
 * Rework is the default; rejecting is for work that wasn't really done.
 * With a photo, the parent can also drop numbered pins on it ("mark up").
 */
import type { Annotations, ReviewBody } from "@tenara/contracts";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Segmented, Sheet } from "../../components/forms";
import { AppText, Button, ErrorText, TextField } from "../../components/ui";
import { colors, spacing } from "../../theme";
import { type Pin, toAnnotations } from "../photos/pins";
import { PhotoViewer } from "../photos/PhotoViews";

type Decision = Exclude<ReviewBody["action"], "APPROVE">;

export function DecisionSheet({
  target,
  submitting,
  error,
  onSubmit,
  onClose,
}: {
  /** Who and what is being reviewed; null hides the sheet. */
  target: { key: string; childName: string; choreName: string; photoUrl?: string | null } | null;
  submitting: boolean;
  error: string | null;
  onSubmit: (body: { action: Decision; note?: string; annotations?: Annotations }) => void;
  onClose: () => void;
}) {
  const [action, setAction] = useState<Decision>("REQUEST_REWORK");
  const [note, setNote] = useState("");
  const [pins, setPins] = useState<Pin[]>([]);
  const [markingUp, setMarkingUp] = useState(false);
  useEffect(() => {
    setAction("REQUEST_REWORK");
    setNote("");
    setPins([]);
    setMarkingUp(false);
  }, [target?.key]);
  const photoUrl = target?.photoUrl ?? null;
  const annotations = toAnnotations(pins);
  const pinCount = annotations?.pins.length ?? 0;

  const name = target?.childName ?? "";
  const trimmed = note.trim();
  return (
    <Sheet visible={target !== null} onClose={onClose}>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="h2">{target?.choreName ?? ""}</AppText>
        <AppText color={colors.textMuted}>{`What should ${name} know?`}</AppText>
      </View>
      <Segmented
        options={[
          { value: "REQUEST_REWORK", label: "Try again" },
          { value: "REJECT", label: "Not accepted" },
        ]}
        value={action}
        onChange={setAction}
      />
      <AppText variant="caption" color={colors.textMuted}>
        {action === "REQUEST_REWORK"
          ? `${name} sees your note and can finish it, then send it back to you.`
          : `${name} won't get credit for this one. Use it for work that wasn't really done.`}
      </AppText>
      <TextField
        label="Note (optional)"
        value={note}
        onChangeText={setNote}
        placeholder={
          action === "REQUEST_REWORK" ? "The pans still need scrubbing" : "Let's talk about it"
        }
        multiline
        maxLength={500}
      />
      {photoUrl !== null && (
        <Button
          title={
            pinCount === 0
              ? "Mark up the photo"
              : `Mark up the photo (${pinCount} ${pinCount === 1 ? "pin" : "pins"})`
          }
          variant="secondary"
          onPress={() => setMarkingUp(true)}
        />
      )}
      <ErrorText message={error} />
      <Button
        title={action === "REQUEST_REWORK" ? "Send back" : "Don't accept"}
        onPress={() =>
          onSubmit({
            action,
            ...(trimmed !== "" && { note: trimmed }),
            ...(annotations && { annotations }),
          })
        }
        loading={submitting}
      />
      <Button title="Cancel" variant="ghost" onPress={onClose} disabled={submitting} />
      <PhotoViewer
        url={markingUp ? photoUrl : null}
        pins={pins}
        onChangePins={setPins}
        onClose={() => setMarkingUp(false)}
      />
    </Sheet>
  );
}
