/**
 * Signing a kid's own phone in with a one-time code from a parent's phone
 * (Family tab → "Set up their phone"). The parent's password never has to be
 * typed on the kid's phone.
 */
import { useMutation } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useState } from "react";
import { BrandHeader } from "../../src/components/brand";
import { Screen, errorMessage } from "../../src/components/Screen";
import { AppText, Button, Card, ErrorText, TextField } from "../../src/components/ui";
import { useApi, useDeviceMode, useSession } from "../../src/state/AppProvider";
import { colors, spacing } from "../../src/theme";

/** Formats as the user types: "abcd2" → "ABCD-2". */
function formatCode(input: string): string {
  const raw = input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  return raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}

export default function Pair() {
  const api = useApi();
  const { start } = useSession();
  const { setDeviceMode } = useDeviceMode();
  const [code, setCode] = useState("");
  const pair = useMutation({
    mutationFn: () => api.pair(code),
    onSuccess: async (auth) => {
      await setDeviceMode("personal"); // it's the kid's own phone
      await start(auth);
    },
  });

  return (
    <Screen header={<BrandHeader subtitle="Set up a kid's own phone." />}>
      <Card style={{ gap: spacing.lg }}>
        <AppText variant="h2">Enter the code</AppText>
        <AppText color={colors.textMuted}>
          On a parent's phone, open Family, pick the kid, and tap "Set up their phone". Codes work
          once, for 10 minutes.
        </AppText>
        <TextField
          label="Code"
          value={code}
          onChangeText={(v) => setCode(formatCode(v))}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="ABCD-2345"
          style={{ fontFamily: "RobotoMono_500Medium", fontSize: 24, letterSpacing: 4 }}
        />
        <ErrorText message={errorMessage(pair.error)} />
        <Button
          title="Connect this phone"
          onPress={() => pair.mutate()}
          loading={pair.isPending}
          disabled={code.replace("-", "").length !== 8}
        />
      </Card>
      <Link href="/sign-in" style={{ alignSelf: "center" }}>
        <AppText variant="bodyStrong" color={colors.primary}>
          Back to sign in
        </AppText>
      </Link>
    </Screen>
  );
}
