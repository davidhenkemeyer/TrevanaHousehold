/**
 * Signed-in area. Sends signed-out users to sign-in and family-less users to
 * onboarding. On a shared device (a parent's phone, a family iPad), it opens
 * on "Who's using this?" and returns there after a couple of idle minutes,
 * so the next person doesn't act as the last one.
 */
import { Redirect, Stack, usePathname, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, AppState, View } from "react-native";
import { SHARED_DEVICE_IDLE_MS } from "../../src/config";
import { useDeviceMode, useMe, useSession } from "../../src/state/AppProvider";
import { colors } from "../../src/theme";

export default function AppLayout() {
  const { session, loaded } = useSession();
  const me = useMe();
  const { deviceMode } = useDeviceMode();
  const pathname = usePathname();
  const router = useRouter();
  const lastActive = useRef(Date.now());

  // Shared devices: back to the picker after inactivity or when reopened.
  useEffect(() => {
    if (deviceMode !== "shared" || !session) return;
    const goToPicker = () => {
      if (pathname !== "/who") router.replace("/who");
    };
    const timer = setInterval(() => {
      if (Date.now() - lastActive.current > SHARED_DEVICE_IDLE_MS) goToPicker();
    }, 10_000);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active" && Date.now() - lastActive.current > SHARED_DEVICE_IDLE_MS)
        goToPicker();
    });
    return () => {
      clearInterval(timer);
      appState.remove();
    };
  }, [deviceMode, session, pathname, router]);

  if (!loaded) return null;
  if (!session) return <Redirect href="/sign-in" />;
  if (me.isPending) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (me.data && me.data.memberships.length === 0 && pathname !== "/onboarding") {
    return <Redirect href="/onboarding" />;
  }

  return (
    <View
      style={{ flex: 1 }}
      onTouchStart={() => {
        lastActive.current = Date.now();
      }}
    >
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
      />
    </View>
  );
}
