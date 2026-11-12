/**
 * Getting a photo from the phone to storage:
 *
 *   pick (camera or library) → shrink to ≤ 1600 px JPEG → ask the API for an
 *   upload form → POST the file straight to storage → keep the `uploadId`.
 *
 * The app then sends only the uploadId (when submitting a chore or saving a
 * chore's reference photo). Re-encoding also drops the photo's metadata,
 * such as where it was taken.
 */
import type { UploadPurpose } from "@tenara/contracts";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import type { Api } from "../../api/endpoints";

/** Longest side after resizing: plenty to judge a chore, small to upload. */
export const MAX_PHOTO_EDGE = 1600;
const JPEG_QUALITY = 0.7;

export class PhotoError extends Error {}

export interface PickedPhoto {
  uri: string;
  width: number;
  height: number;
}

/** Opens the camera or the photo library. Null if the person cancels. */
export async function pickPhoto(source: "camera" | "library"): Promise<PickedPhoto | null> {
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new PhotoError(
        "Tenara Family needs the camera for this. You can allow it in Settings.",
      );
    }
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1 };
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { uri: asset.uri, width: asset.width, height: asset.height } : null;
}

/** The size to shrink to: the longest side at most MAX_PHOTO_EDGE, never enlarged. */
export function resizeTarget(
  width: number,
  height: number,
): { width: number } | { height: number } | null {
  if (width <= 0 || height <= 0) return null;
  if (Math.max(width, height) <= MAX_PHOTO_EDGE) return null;
  return width >= height ? { width: MAX_PHOTO_EDGE } : { height: MAX_PHOTO_EDGE };
}

/** Shrinks and re-encodes as JPEG. */
export async function preparePhoto(photo: PickedPhoto): Promise<string> {
  const context = ImageManipulator.manipulate(photo.uri);
  const target = resizeTarget(photo.width, photo.height);
  if (target) context.resize(target);
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
  return saved.uri;
}

/**
 * The form storage expects: every signed field first, then the file last
 * (S3 ignores fields after the file).
 */
export function uploadFormData(
  fields: Record<string, string>,
  file: Blob | { uri: string; name: string; type: string },
): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  // React Native's FormData accepts { uri, name, type } for local files.
  form.append("file", file as Blob);
  return form;
}

/** Uploads a prepared photo and returns its uploadId. */
export async function uploadPhoto(
  api: Api,
  familyId: string,
  purpose: UploadPurpose,
  uri: string,
): Promise<string> {
  const upload = await api.createUpload(familyId, { purpose, contentType: "image/jpeg" });
  const file =
    Platform.OS === "web"
      ? await (await fetch(uri)).blob()
      : { uri, name: "photo.jpg", type: "image/jpeg" };
  let res: Response;
  try {
    res = await fetch(upload.url, { method: "POST", body: uploadFormData(upload.fields, file) });
  } catch (error) {
    throw new PhotoError("Couldn't upload the photo. Check your connection and try again.", {
      cause: error,
    });
  }
  if (!res.ok) {
    throw new PhotoError(
      res.status === 400 || res.status === 413
        ? "That photo is too large. Try a different one."
        : "Couldn't upload the photo. Try again.",
    );
  }
  return upload.uploadId;
}
