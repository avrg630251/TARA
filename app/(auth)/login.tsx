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
      <View style={styles.page}>
        <Text style={styles.brand}>TARA!</Text>
        <Text style={styles.title}>Sign In</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Username</Text>
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
            autoComplete="password"
            textContentType="password"
          />

          <Text style={styles.forgot}>Forgot password?</Text>

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
              <Text style={styles.primaryBtnText}>Sign In</Text>
            )}
          </Pressable>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don&apos;t have account? </Text>
            <Link href="/signup" asChild>
              <Pressable>
                <Text style={styles.link}>Sign Up</Text>
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
    textAlign: "left",
  },
  title: {
    fontSize: 34,
    lineHeight: 42,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 18,
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
  forgot: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "500",
    color: "#1f2937",
    marginTop: 6,
    marginBottom: 20,
  },
  error: {
    color: "#dc2626",
    fontSize: 14,
    marginBottom: 12,
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
