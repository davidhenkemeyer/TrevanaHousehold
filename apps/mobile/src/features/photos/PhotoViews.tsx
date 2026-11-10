/**
 * Showing photos: a photo with numbered pins on it, thumbnails, a placeholder
 * for expired photos, and a full-screen viewer that can also be used to add
 * pins ("mark up").
 */
import { useEffect, useState } from "react";
import {
  Image,
  type LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText, Button, TextField } from "../../components/ui";
import { colors, radii, spacing } from "../../theme";
import {
  MAX_PINS,
  MAX_PIN_COMMENT,
  type Pin,
  nextPinNumber,
  pressPosition,
  tapToPercent,
} from "./pins";

/** The photo's own width/height ratio, so pin percentages match the picture exactly. */
function useAspectRatio(url: string): number {
  const [ratio, setRatio] = useState(4 / 3);
  useEffect(() => {
    let alive = true;
    Image.getSize(
      url,
      (w, h) => alive && h > 0 && setRatio(w / h),
      () => undefined, // keep the default; the image itself shows the error
    );
    return () => {
      alive = false;
    };
  }, [url]);
  return ratio;
}

export function PinMarker({ pin, selected = false }: { pin: number; selected?: boolean }) {
  return (
    <View style={[styles.marker, selected && styles.markerSelected]}>
      <AppText variant="mono" color={colors.onPrimary}>
        {String(pin)}
      </AppText>
    </View>
  );
}

/** A photo at its natural shape, with pins on top. `onTap` gets percent positions. */
export function PhotoWithPins({
  url,
  pins = [],
  selectedPin,
  onTap,
  onSelectPin,
  maxHeight = 420,
  accessibilityLabel = "Photo",
}: {
  url: string;
  pins?: readonly Pin[];
  selectedPin?: number | null;
  onTap?: (position: { xPercent: number; yPercent: number }) => void;
  onSelectPin?: (pin: number) => void;
  maxHeight?: number;
  accessibilityLabel?: string;
}) {
  const ratio = useAspectRatio(url);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  return (
    <Pressable
      accessibilityRole={onTap ? "button" : "image"}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={onTap ? "Tap where you want to add a pin" : undefined}
      disabled={!onTap}
      onPress={(e) => {
        const { x, y } = pressPosition(e.nativeEvent);
        const position = tapToPercent(x, y, size.width, size.height);
        if (position) onTap?.(position);
      }}
      onLayout={onLayout}
      style={{ width: "100%", aspectRatio: ratio, maxHeight, alignSelf: "center" }}
    >
      <Image source={{ uri: url }} style={styles.fill} resizeMode="cover" />
      {pins.map((p) => (
        <Pressable
          key={p.pin}
          accessibilityRole="button"
          accessibilityLabel={`Pin ${p.pin}: ${p.comment || "no comment yet"}`}
          disabled={!onSelectPin}
          onPress={() => onSelectPin?.(p.pin)}
          hitSlop={8}
          style={[styles.pinSpot, { left: `${p.xPercent}%`, top: `${p.yPercent}%` }]}
        >
          <PinMarker pin={p.pin} selected={selectedPin === p.pin} />
        </Pressable>
      ))}
    </Pressable>
  );
}

/** Pin numbers and comments under a photo. */
export function PinList({ pins }: { pins: readonly Pin[] }) {
  if (pins.length === 0) return null;
  return (
    <View style={{ gap: spacing.xs }}>
      {[...pins]
        .sort((a, b) => a.pin - b.pin)
        .map((p) => (
          <View key={p.pin} style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
            <PinMarker pin={p.pin} />
            <AppText style={{ flex: 1 }}>{p.comment}</AppText>
          </View>
        ))}
    </View>
  );
}

export function PhotoThumb({
  url,
  label,
  onPress,
  size = 96,
  accessibilityLabel,
}: {
  url: string;
  label?: string;
  onPress?: () => void;
  size?: number;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : "image"}
      accessibilityLabel={accessibilityLabel ?? label ?? "Photo"}
      disabled={!onPress}
      onPress={onPress}
      style={{ gap: spacing.xxs, alignItems: "center" }}
    >
      <Image source={{ uri: url }} style={[styles.thumb, { width: size, height: size }]} />
      {label !== undefined && (
        <AppText variant="caption" color={colors.textMuted}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

export function ExpiredPhoto() {
  return (
    <View style={styles.expired} accessibilityRole="text">
      <AppText variant="caption" color={colors.textMuted}>
        Photo expired
      </AppText>
    </View>
  );
}

/**
 * Full-screen photo. Read-only, or with `onChangePins` a mark-up editor: tap
 * the photo to drop a numbered pin, then write what it's about.
 */
export function PhotoViewer({
  url,
  pins = [],
  title,
  onChangePins,
  onClose,
}: {
  /** Null hides the viewer. */
  url: string | null;
  pins?: readonly Pin[];
  title?: string;
  onChangePins?: (pins: Pin[]) => void;
  onClose: () => void;
}) {
  const editing = onChangePins !== undefined;
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => setSelected(null), [url]);

  const update = (pin: number, comment: string) =>
    onChangePins?.(pins.map((p) => (p.pin === pin ? { ...p, comment } : p)));
  const add = (position: { xPercent: number; yPercent: number }) => {
    if (pins.length >= MAX_PINS) return;
    const pin = nextPinNumber(pins);
    onChangePins?.([...pins, { pin, ...position, comment: "" }]);
    setSelected(pin);
  };

  return (
    <Modal visible={url !== null} animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.viewer}>
        <ScrollView
          contentContainerStyle={styles.viewerContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <AppText variant="h2" color={colors.onPrimary} style={{ flex: 1 }}>
              {title ?? (editing ? "Mark up the photo" : "Photo")}
            </AppText>
            <Button title="Done" variant="ghost" onPress={onClose} />
          </View>
          {editing && (
            <AppText color={colors.onPrimary}>
              Tap the photo to drop a pin, then say what it's about.
            </AppText>
          )}
          {url !== null && (
            <PhotoWithPins
              url={url}
              pins={pins}
              selectedPin={selected}
              maxHeight={560}
              {...(editing && { onTap: add, onSelectPin: setSelected })}
              accessibilityLabel={editing ? "Photo: tap to add a pin" : "Photo"}
            />
          )}
          {editing ? (
            [...pins]
              .sort((a, b) => a.pin - b.pin)
              .map((p) => (
                <View key={p.pin} style={styles.pinRow}>
                  <PinMarker pin={p.pin} selected={selected === p.pin} />
                  <View style={{ flex: 1 }}>
                    <TextField
                      label={`Pin ${p.pin}`}
                      value={p.comment}
                      onChangeText={(text) => update(p.pin, text)}
                      onFocus={() => setSelected(p.pin)}
                      placeholder="What's wrong here?"
                      maxLength={MAX_PIN_COMMENT}
                    />
                  </View>
                  <Button
                    title="✕"
                    variant="ghost"
                    accessibilityLabel={`Remove pin ${p.pin}`}
                    onPress={() => onChangePins(pins.filter((x) => x.pin !== p.pin))}
                  />
                </View>
              ))
          ) : (
            <View style={styles.pinListOnDark}>
              <PinList pins={pins} />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const PIN_SIZE = 28;

const styles = StyleSheet.create({
  fill: { width: "100%", height: "100%", borderRadius: radii.card },
  marker: {
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: PIN_SIZE / 2,
    backgroundColor: colors.attention,
    borderWidth: 2,
    borderColor: colors.onPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  markerSelected: { backgroundColor: colors.primary, transform: [{ scale: 1.15 }] },
  // Centers the marker on the tapped point.
  pinSpot: { position: "absolute", marginLeft: -PIN_SIZE / 2, marginTop: -PIN_SIZE / 2 },
  thumb: { borderRadius: radii.button, backgroundColor: colors.border },
  expired: {
    width: 96,
    height: 96,
    borderRadius: radii.button,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  viewer: { flex: 1, backgroundColor: colors.text },
  viewerContent: {
    padding: spacing.lg,
    gap: spacing.lg,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  pinRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  pinListOnDark: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
  },
});
