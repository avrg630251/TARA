import { Link } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AuthScreen } from "@/components/AuthScreen";
import { PasswordField } from "@/components/PasswordField";
import { supabase } from "@/lib/supabase";

export default function SignupScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setInfo(null);
    const trimmedEmail = email.trim();
    if (!fullName.trim() || !trimmedEmail || !password) {
      setError("Enter your full name, email, and password.");
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
      email: trimmedEmail,
      password,
      options: {
        data: {
          full_name: fullName.trim(),
        },
      },
    });
    setSubmitting(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (data.session) {

      return;
    }

    setInfo(
      "Check your email to confirm your account, then sign in. If confirmations are disabled in Supabase, try signing in now."
    );
  }

  return (
    <AuthScreen>
      <View style={styles.page}>
        <Text style={styles.brand}>TARA!</Text>
        <Text style={styles.title}>Sign Up</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder=""
            placeholderTextColor="#9ca3af"
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
          />

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder=""
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
          />

          <Text style={styles.label}>Password</Text>
          <PasswordField
            value={password}
            onChangeText={setPassword}
            placeholder=""
            autoComplete="new-password"
            textContentType="newPassword"
          />

          <Text style={styles.label}>Confirm Password</Text>
          <PasswordField
            value={confirm}
            onChangeText={setConfirm}
            placeholder=""
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
              <Text style={styles.primaryBtnText}>Sign Up</Text>
            )}
          </Pressable>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href="/login" asChild>
              <Pressable>
                <Text style={styles.link}>Sign In</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  page: {
    width: "100%",
    maxWidth: 390,
    alignSelf: "center",
    paddingTop: 12,
  },
  brand: {
    fontSize: 52,
    lineHeight: 60,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -1.2,
    marginBottom: 2,
  },
  title: {
    fontSize: 34,
    lineHeight: 42,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 16,
  },
  card: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
  },
  label: {
    fontSize: 17,
    fontWeight: "400",
    color: "#1f2937",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
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
    backgroundColor: "#1C5141",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 10,
  },
  primaryBtnPressed: {
    opacity: 0.9,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    flexWrap: "wrap",
  },
  footerText: {
    fontSize: 16,
    color: "#1f2937",
  },
  link: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1C5141",
    textDecorationLine: "underline",
  },
});
