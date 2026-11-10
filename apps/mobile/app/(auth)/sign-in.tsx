import { useMutation } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { BrandHeader } from "../../src/components/brand";
import { Screen, errorMessage } from "../../src/components/Screen";
import { AppText, Button, Card, ErrorText, TextField } from "../../src/components/ui";
import { useApi, useSession } from "../../src/state/AppProvider";
import { colors, spacing } from "../../src/theme";

export default function SignIn() {
  const api = useApi();
  const { start } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const signIn = useMutation({
    mutationFn: () => api.login({ email, password }),
    onSuccess: (auth) => start(auth),
  });

  return (
    <Screen header={<BrandHeader subtitle="Building Habits, Together." />}>
      <Card style={{ gap: spacing.lg }}>
        <AppText variant="h2">Sign in</AppText>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          inputMode="email"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          onSubmitEditing={() => signIn.mutate()}
        />
        <ErrorText message={errorMessage(signIn.error)} />
        <Button
          title="Sign in"
          onPress={() => signIn.mutate()}
          loading={signIn.isPending}
          disabled={!email || !password}
        />
      </Card>
      <View style={{ gap: spacing.md, alignItems: "center" }}>
        <Link href="/sign-up" style={{ color: colors.primary }}>
          <AppText variant="bodyStrong" color={colors.primary}>
            New here? Create a family account
          </AppText>
        </Link>
        <Link href="/pair">
          <AppText variant="bodyStrong" color={colors.info}>
            Setting up a kid's phone? Enter a code
          </AppText>
        </Link>
      </View>
    </Screen>
  );
}
