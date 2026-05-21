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

export default function SignupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setInfo(null);
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setError("Enter your email and password.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: trimmed,
      password,
    });
    setSubmitting(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (data.session) {
      router.replace("/(main)");
      return;
    }

    setInfo(
      "Check your email to confirm your account, then sign in. If confirmations are disabled in Supabase, try signing in now."
    );
  }

  return (
    <AuthScreen>
      <View style={styles.card}>
        <AuthBackButton />
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Join TARA to plan your trips</Text>

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
          placeholder="At least 8 characters"
          autoComplete="new-password"
          textContentType="newPassword"
        />

        <Text style={styles.label}>Confirm password</Text>
        <PasswordField
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Repeat password"
          autoComplete="new-password"
          textContentType="newPassword"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {info ? <Text style={styles.info}>{info}</Text> : null}

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
            <Text style={styles.primaryBtnText}>Sign up</Text>
          )}
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Link href="/login" asChild>
            <Pressable>
              <Text style={styles.link}>Sign in</Text>
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
  info: {
    color: "#2d6a4f",
    fontSize: 14,
    marginBottom: 12,
    lineHeight: 20,
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
