import { Link, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AuthBackButton } from "@/components/AuthBackButton";
import { AuthScreen } from "@/components/AuthScreen";
import { PasswordField } from "@/components/PasswordField";
import { supabase } from "@/lib/supabase";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setError("Enter your email and password.");
      return;
    }

    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmed,
      password,
    });
    setSubmitting(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.replace("/(main)");
  }

  return (
    <AuthScreen>
      <View style={styles.card}>
        <AuthBackButton />
        <Text style={styles.brand}>TARA</Text>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />

        <Text style={styles.label}>Password</Text>
        <PasswordField
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          autoComplete="password"
          textContentType="password"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && styles.primaryBtnPressed,
            submitting && styles.primaryBtnDisabled,
          ]}
          onPress={onSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Sign in</Text>
          )}
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.footerText}>No account? </Text>
          <Link href="/signup" asChild>
            <Pressable>
              <Text style={styles.link}>Create one</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
  },
  brand: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1B4332",
    letterSpacing: 1,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: "#64748b",
    marginBottom: 28,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#0f172a",
    backgroundColor: "#fff",
    marginBottom: 16,
  },
  error: {
    color: "#dc2626",
    fontSize: 14,
    marginBottom: 12,
  },
  primaryBtn: {
    backgroundColor: "#1B4332",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  primaryBtnPressed: {
    opacity: 0.9,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 24,
    flexWrap: "wrap",
  },
  footerText: {
    fontSize: 15,
    color: "#64748b",
  },
  link: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1B4332",
  },
});
