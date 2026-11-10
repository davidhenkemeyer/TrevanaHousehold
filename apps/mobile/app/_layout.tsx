/**
 * Root layout: fonts, app state, and the navigation stack. The (auth) and
 * (app) groups each decide where a signed-out or signed-in user belongs.
 */
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { RobotoMono_500Medium } from "@expo-google-fonts/roboto-mono";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider } from "../src/state/AppProvider";
import { colors } from "../src/theme";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    RobotoMono_500Medium,
  });
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        />
      </AppProvider>
    </SafeAreaProvider>
  );
}
