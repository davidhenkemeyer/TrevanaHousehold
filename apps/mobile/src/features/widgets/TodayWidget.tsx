/**
 * The Android home-screen widget, drawn by react-native-android-widget from
 * the last snapshot. Tapping it opens the app. Colors are the Tenara tokens.
 */
import { FlexWidget, TextWidget } from "react-native-android-widget";
import { colors } from "../../theme";
import { type WidgetSnapshot, widgetText } from "./snapshot";

/** The widget's name in app.config.ts. */
export const ANDROID_WIDGET_NAME = "Today";

type Hex = `#${string}`;
const hex = (value: string) => value as Hex;

export function TodayWidget({ snapshot }: { snapshot: WidgetSnapshot | null }) {
  const text = snapshot
    ? widgetText(snapshot)
    : { title: "Tenara", subtitle: "Open the app to see today's chores." };
  const rows = snapshot && !snapshot.locked ? snapshot.next : [];
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: "match_parent",
        width: "match_parent",
        flexDirection: "column",
        padding: 14,
        borderRadius: 16,
        backgroundColor: hex(colors.surface),
      }}
    >
      <TextWidget
        text={text.title}
        style={{ fontSize: 16, fontWeight: "700", color: hex(colors.text) }}
      />
      <TextWidget
        text={text.subtitle}
        style={{ fontSize: 12, color: hex(colors.textMuted), marginTop: 2 }}
      />
      {rows.map((row) => (
        <FlexWidget
          key={row.name}
          style={{ flexDirection: "row", width: "match_parent", marginTop: 8 }}
        >
          <FlexWidget style={{ flex: 1 }}>
            <TextWidget
              text={`• ${row.name}`}
              maxLines={1}
              truncate="END"
              style={{ fontSize: 13, color: hex(colors.text) }}
            />
          </FlexWidget>
          <TextWidget text={row.when} style={{ fontSize: 12, color: hex(colors.textMuted) }} />
        </FlexWidget>
      ))}
    </FlexWidget>
  );
}
