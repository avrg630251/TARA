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
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

export default function LoginScreen() {
  const router = useRouter();
  const { loginAsGuest, clearPasswordRecovery } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsOtpVerify, setNeedsOtpVerify] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setNeedsOtpVerify(false);
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setError("Enter your email and password.");
      return;
    }

    clearPasswordRecovery();
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmed,
      password,
    });
    setSubmitting(false);

    if (signInError) {
      const msg = (signInError.message || "").toLowerCase();
      if (msg.includes("email not confirmed")) {
        setNeedsOtpVerify(true);
        setError(
          "Your email address has not been verified yet. Please enter the 6-digit OTP code sent to your email."
        );
      } else if (
        signInError.status === 429 ||
        msg.includes("rate limit") ||
        msg.includes("email rate exceeded")
      ) {
        setError(
          "Too many sign-in or email attempts. Please wait a minute before trying again."
        );
      } else {
        setError(signInError.message);
      }
      return;
    }

  }

  return (
    <AuthScreen>
      <View style={styles.page}>
        <Text style={styles.brand}>TARA-neta</Text>
        <Text style={styles.title}>Sign In</Text>

        <View style={styles.card}>
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
            autoComplete="password"
            textContentType="password"
          />

          <Pressable
            style={({ pressed }) => [
              styles.forgotBtn,
              pressed && { opacity: 0.7 },
            ]}
            onPress={() =>
              router.push({
                pathname: "/forgot-password",
                params: email.trim() ? { email: email.trim() } : undefined,
              } as any)
            }
            accessibilityRole="button"
            accessibilityLabel="Forgot password"
          >
            <Text style={styles.forgot}>Forgot password?</Text>
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {needsOtpVerify ? (
            <Pressable
              style={({ pressed }) => [
                styles.verifyOtpBtn,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() =>
                router.push({
                  pathname: "/signup",
                  params: { step: "otp", email: email.trim() },
                } as any)
              }
            >
              <Text style={styles.verifyOtpBtnText}>
                Enter 6-Digit Verification OTP
              </Text>
            </Pressable>
          ) : null}

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

          <Pressable
            style={({ pressed }) => [
              styles.guestBtn,
              pressed && { opacity: 0.7 },
            ]}
            onPress={async () => {
              await loginAsGuest();
              router.replace("/(main)");
            }}
          >
            <Text style={styles.guestBtnText}>Skip login · Continue as Guest</Text>
          </Pressable>
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
  forgotBtn: {
    alignSelf: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: 4,
    marginBottom: 16,
  },
  forgot: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
    color: "#1C5141",
    textDecorationLine: "underline",
  },
  error: {
    color: "#dc2626",
    fontSize: 14,
    marginBottom: 12,
  },
  verifyOtpBtn: {
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#16a34a",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    marginBottom: 8,
  },
  verifyOtpBtnText: {
    color: "#15803d",
    fontSize: 14,
    fontWeight: "700",
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
  guestBtn: {
    marginTop: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  guestBtnText: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
