import { useMutation } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useState } from "react";
import { BrandHeader } from "../../src/components/brand";
import { Screen, errorMessage } from "../../src/components/Screen";
import { AppText, Button, Card, ErrorText, TextField } from "../../src/components/ui";
import { useApi, useSession } from "../../src/state/AppProvider";
import { colors, spacing } from "../../src/theme";

export default function SignUp() {
  const api = useApi();
  const { start } = useSession();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const signUp = useMutation({
    mutationFn: () => api.signup({ displayName, email, password }),
    onSuccess: (auth) => start(auth),
  });
  const tooShort = password.length > 0 && password.length < 8;

  return (
    <Screen
      header={<BrandHeader subtitle="Create your family's account. You can add kids next." />}
    >
      <Card style={{ gap: spacing.lg }}>
        <AppText variant="h2">Create an account</AppText>
        <TextField
          label="Your name"
          value={displayName}
          onChangeText={setDisplayName}
          autoComplete="name"
        />
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
          label="Password (at least 8 characters)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          error={tooShort ? "At least 8 characters" : undefined}
        />
        <ErrorText message={errorMessage(signUp.error)} />
        <Button
          title="Create account"
          onPress={() => signUp.mutate()}
          loading={signUp.isPending}
          disabled={!displayName || !email || password.length < 8}
        />
      </Card>
      <Link href="/sign-in" style={{ alignSelf: "center" }}>
        <AppText variant="bodyStrong" color={colors.primary}>
          Already have an account? Sign in
        </AppText>
      </Link>
    </Screen>
  );
}
