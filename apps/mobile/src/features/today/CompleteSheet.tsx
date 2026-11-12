/**
 * "Did you do everything?": the chore's checklist and photo before submitting.
 * Kids may submit with steps unchecked (the parent sees "2/3" and decides).
 * When the chore needs a photo, "Done" waits for one; the API checks too.
 * A reference photo, if the chore has one, shows what "done" looks like.
 */
import { MAX_SUBMISSION_PHOTOS, type Instance } from "@tenara/contracts";
import { useEffect, useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import { AppText, Button, Card, Checkbox, ErrorText } from "../../components/ui";
import { colors, spacing } from "../../theme";
import { type PickedItem, PhotoPicker, isUploading, readyUploadIds } from "../photos/PhotoPicker";
import { PhotoThumb, PhotoViewer } from "../photos/PhotoViews";

export function CompleteSheet({
  item,
  photoRequired,
  submitting,
  error,
  onSubmit,
  onClose,
}: {
  item: Instance | null;
  /** The chore needs a photo from this person (kids; a parent's word is enough). */
  photoRequired: boolean;
  submitting: boolean;
  error: string | null;
  onSubmit: (checked: Record<string, boolean>, photoUploadIds: string[]) => void;
  onClose: () => void;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [photos, setPhotos] = useState<PickedItem[]>([]);
  const [viewing, setViewing] = useState<string | null>(null);
  useEffect(() => {
    setChecked({});
    setPhotos([]);
  }, [item?.id]);
  if (!item) return null;

  const done = item.checklist.filter((i) => checked[i.id]).length;
  const total = item.checklist.length;
  const uploadIds = readyUploadIds(photos);
  const uploading = isUploading(photos);
  const needsPhoto = photoRequired && uploadIds.length === 0;

  const doneTitle = needsPhoto
    ? "Add a photo first"
    : uploading
      ? "Uploading photo…"
      : total === 0 || done === total
        ? "All done! ✓"
        : `Done (${done}/${total})`;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View
        style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15, 23, 42, 0.5)" }}
      >
        <Card
          style={{
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            maxHeight: "90%",
            width: "100%",
            maxWidth: 640,
            alignSelf: "center",
          }}
        >
          <ScrollView contentContainerStyle={{ gap: spacing.lg }} style={{ flexGrow: 0 }}>
            <View style={{ gap: spacing.xs }}>
              <AppText variant="h2">{item.choreName}</AppText>
              {total > 0 && (
                <AppText color={colors.textMuted}>Check off each step you did.</AppText>
              )}
            </View>

            {item.referencePhotoUrl && (
              <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "center" }}>
                <PhotoThumb
                  url={item.referencePhotoUrl}
                  size={72}
                  accessibilityLabel="What done looks like"
                  onPress={() => setViewing(item.referencePhotoUrl)}
                />
                <AppText color={colors.textMuted} style={{ flex: 1 }}>
                  Make it look like this.
                </AppText>
              </View>
            )}

            {total > 0 && (
              <View>
                {item.checklist.map((step) => (
                  <Checkbox
                    key={step.id}
                    label={step.text}
                    checked={checked[step.id] ?? false}
                    onToggle={() => setChecked((c) => ({ ...c, [step.id]: !c[step.id] }))}
                  />
                ))}
                <AppText variant="mono" color={done === total ? colors.success : colors.textMuted}>
                  {`${done}/${total} steps`}
                </AppText>
              </View>
            )}

            <View style={{ gap: spacing.sm }}>
              <AppText variant="bodyStrong">
                {photoRequired ? "Photo (needed)" : "Photo (optional)"}
              </AppText>
              <PhotoPicker
                purpose="SUBMISSION"
                max={MAX_SUBMISSION_PHOTOS}
                items={photos}
                onChange={setPhotos}
              />
            </View>

            <ErrorText message={error} />
            <Button
              title={doneTitle}
              onPress={() => onSubmit(checked, uploadIds)}
              loading={submitting}
              disabled={needsPhoto || uploading}
            />
            <Button title="Not yet" variant="ghost" onPress={onClose} disabled={submitting} />
          </ScrollView>
        </Card>
      </View>
      <PhotoViewer url={viewing} title="What done looks like" onClose={() => setViewing(null)} />
    </Modal>
  );
}
