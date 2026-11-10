import { Redirect, Stack } from "expo-router";
import { useSession } from "../../src/state/AppProvider";

/** Signed-out screens. Anyone already signed in goes to the app. */
export default function AuthLayout() {
  const { session, loaded } = useSession();
  if (!loaded) return null;
  if (session) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
