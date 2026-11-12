/**
 * "Take photo" / "Choose photo" with thumbnails. Each photo is shrunk and
 * uploaded right away, so by the time the person taps "Done" the photos are
 * already in storage and only their upload ids are sent.
 *
 * Controlled: the parent screen owns the list (see `readyUploadIds`).
 */
import type { UploadPurpose } from "@tenara/contracts";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";
import { AppText, Button } from "../../components/ui";
import { useApi, useFamily } from "../../state/AppProvider";
import { colors, spacing } from "../../theme";
import { PhotoThumb } from "./PhotoViews";
import { PhotoError, pickPhoto, preparePhoto, uploadPhoto } from "./upload";

export interface PickedItem {
  /** Local id for the list. */
  id: string;
  uri: string;
  uploadId?: string;
  error?: string;
}

export const readyUploadIds = (items: readonly PickedItem[]): string[] =>
  items.flatMap((i) => (i.uploadId !== undefined ? [i.uploadId] : []));
export const isUploading = (items: readonly PickedItem[]): boolean =>
  items.some((i) => i.uploadId === undefined && i.error === undefined);

let counter = 0;

export function PhotoPicker({
  purpose,
  max,
  items,
  onChange,
}: {
  purpose: UploadPurpose;
  max: number;
  items: readonly PickedItem[];
  /** Called with an updater, because uploads finish after the list has moved on. */
  onChange: (update: (items: PickedItem[]) => PickedItem[]) => void;
}) {
  const api = useApi();
  const { familyId } = useFamily();

  const add = async (source: "camera" | "library") => {
    const id = `p${++counter}`;
    try {
      const picked = await pickPhoto(source);
      if (!picked) return;
      // List it right away, so "Done"/"Save" wait while it's resized and uploaded.
      onChange((list) => [...list, { id, uri: picked.uri }]);
      const uri = await preparePhoto(picked);
      const uploadId = await uploadPhoto(api, familyId!, purpose, uri);
      onChange((list) => list.map((i) => (i.id === id ? { ...i, uri, uploadId } : i)));
    } catch (error) {
      const message =
        error instanceof PhotoError ? error.message : "Couldn't add that photo. Try again.";
      onChange((list) =>
        list.some((i) => i.id === id)
          ? list.map((i) => (i.id === id ? { ...i, error: message } : i))
          : [...list, { id, uri: "", error: message }],
      );
    }
  };

  const full = items.length >= max;
  return (
    <View style={{ gap: spacing.md }}>
      {items.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
          {items.map((item) => (
            <View key={item.id} style={{ gap: spacing.xxs, alignItems: "center" }}>
              {item.uri !== "" && <PhotoThumb url={item.uri} size={88} />}
              {item.uploadId === undefined && item.error === undefined && (
                <View style={{ flexDirection: "row", gap: spacing.xs, alignItems: "center" }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <AppText variant="caption" color={colors.textMuted}>
                    Uploading
                  </AppText>
                </View>
              )}
              {item.error !== undefined && (
                <AppText variant="caption" color={colors.danger} style={{ maxWidth: 160 }}>
                  {item.error}
                </AppText>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
                onPress={() => onChange((list) => list.filter((i) => i.id !== item.id))}
                hitSlop={6}
              >
                <AppText variant="caption" color={colors.primary}>
                  Remove
                </AppText>
              </Pressable>
            </View>
          ))}
        </View>
      )}
      {!full && (
        <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
          {Platform.OS !== "web" && (
            <Button title="Take photo" variant="secondary" onPress={() => void add("camera")} />
          )}
          <Button
            title={Platform.OS === "web" ? "Add photo" : "Choose photo"}
            variant={Platform.OS === "web" ? "secondary" : "ghost"}
            onPress={() => void add("library")}
          />
        </View>
      )}
    </View>
  );
}
