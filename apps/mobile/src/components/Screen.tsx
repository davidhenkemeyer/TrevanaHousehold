import type { ReactNode } from "react";
import { type RefreshControlProps, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "../api/http";
import { colors, spacing } from "../theme";

/** Standard screen: safe-area aware, scrollable, Slate 100 background, centered on wide screens. */
export function Screen({
  children,
  header,
  refreshControl,
}: {
  children: ReactNode;
  header?: ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}) {
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top", "left", "right"]}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        {...(refreshControl && { refreshControl })}
      >
        {header}
        <View
          style={{
            padding: spacing.lg,
            gap: spacing.lg,
            width: "100%",
            maxWidth: 640,
            alignSelf: "center",
          }}
        >
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** The API's messages are written for people; show them as-is. */
export function errorMessage(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Please try again.";
}
