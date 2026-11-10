import * as Linking from "expo-linking";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AuthScreen } from "@/components/AuthScreen";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getRecoveryRedirectUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `${window.location.origin}/auth/callback?type=recovery`;
  }
  return Linking.createURL("auth/callback", {
    queryParams: { type: "recovery" },
  });
}

function parseParamsFromUrlLike(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const qIndex = raw.indexOf("?");
  const hIndex = raw.indexOf("#");

  const segments: string[] = [];
  if (qIndex !== -1) {
    const end = hIndex !== -1 && hIndex > qIndex ? hIndex : raw.length;
    segments.push(raw.slice(qIndex + 1, end));
  }
  if (hIndex !== -1) {
    segments.push(raw.slice(hIndex + 1));
  }

  for (const seg of segments) {
    const search = new URLSearchParams(seg);
    search.forEach((value, key) => {
      out[key] = value;
    });
  }
  return out;
}

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const { markPasswordRecovery, clearPasswordRecovery } = useAuth();

  const [email, setEmail] = useState(
    typeof params.email === "string" ? params.email : ""
  );
  const [recoveryInput, setRecoveryInput] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [showCodeSection, setShowCodeSection] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  async function handleSendResetEmail() {
    if (cooldownSeconds > 0 || sending) return;
    setError(null);
    setInfo(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Enter your email address.");
      return;
    }
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    setSending(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      trimmedEmail,
      {
        redirectTo: getRecoveryRedirectUrl(),
      }
    );
    setSending(false);

    if (resetError) {
      const msg = (resetError.message || "").toLowerCase();
      if (
        resetError.status === 429 ||
        msg.includes("rate limit") ||
        msg.includes("email rate exceeded") ||
        msg.includes("over_email_send_rate_limit")
      ) {
        setCooldownSeconds(60);
        setShowCodeSection(true);
        setInfo(
          "A recovery email was recently sent. Please check your inbox (and spam folder) for your 6-digit recovery OTP code and enter it below, or wait 60 seconds before requesting another email."
        );
        return;
      }
      setError(resetError.message);
      return;
    }

    setEmailSent(true);
    setShowCodeSection(true);
    setCooldownSeconds(60);
    setInfo(
      `Password reset instructions were sent to ${trimmedEmail}. Enter the 6-digit recovery OTP code (or reset link) from your email below.`
    );
  }

  async function handleVerifyRecovery() {
    setError(null);

    const trimmedEmail = email.trim();
    const cleanedInput = recoveryInput.trim();

    if (!cleanedInput) {
      setError("Enter the recovery code or reset link from your email.");
      return;
    }

    const looksLikeUrlOrParams =
      cleanedInput.includes("://") ||
      cleanedInput.includes("token=") ||
      cleanedInput.includes("token_hash=") ||
      cleanedInput.includes("code=") ||
      cleanedInput.includes("access_token=");

    if (!looksLikeUrlOrParams && !trimmedEmail) {
      setError("Enter your email address above before verifying your code.");
      return;
    }

    setVerifying(true);
    try {
      markPasswordRecovery();

      if (looksLikeUrlOrParams) {
        const extracted = parseParamsFromUrlLike(cleanedInput);
        if (extracted.access_token && extracted.refresh_token) {
          const { error: sessionErr } = await supabase.auth.setSession({
            access_token: extracted.access_token,
            refresh_token: extracted.refresh_token,
          });
          if (sessionErr) {
            clearPasswordRecovery();
            setError(sessionErr.message);
            return;
          }
          router.replace("/auth/reset-password" as any);
          return;
        }

        if (extracted.code) {
          const { error: codeErr } = await supabase.auth.exchangeCodeForSession(
            extracted.code
          );
          if (codeErr) {
            clearPasswordRecovery();
            setError(codeErr.message);
            return;
          }
          router.replace("/auth/reset-password" as any);
          return;
        }

        const hashToken = extracted.token_hash || extracted.token;
        if (hashToken) {
          const { error: hashErr } = await supabase.auth.verifyOtp({
            token_hash: hashToken,
            type: "recovery",
          });
          if (hashErr) {
            clearPasswordRecovery();
            setError(hashErr.message);
            return;
          }
          router.replace("/auth/reset-password" as any);
          return;
        }
      }

      // Standard numeric/short recovery OTP code
      const { error: otpError } = await supabase.auth.verifyOtp({
        email: trimmedEmail,
        token: cleanedInput,
        type: "recovery",
      });

      if (otpError) {
        // Fallback if user pasted a raw token_hash directly (e.g. pkce_...)
        if (cleanedInput.length > 12) {
          const { error: fallbackErr } = await supabase.auth.verifyOtp({
            token_hash: cleanedInput,
            type: "recovery",
          });
          if (!fallbackErr) {
            router.replace("/auth/reset-password" as any);
            return;
          }
        }
        clearPasswordRecovery();
        setError("Invalid or expired recovery code. Request a new reset email and try again.");
        return;
      }

      router.replace("/auth/reset-password" as any);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <AuthScreen>
      <View style={styles.page}>
        <Text style={styles.brand}>TARA-neta</Text>
        <Text style={styles.title}>Forgot Password</Text>

        <View style={styles.card}>
          <Text style={styles.helperText}>
            Enter the email address linked to your account and we&apos;ll send
            instructions to reset your password.
          </Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {info ? <Text style={styles.info}>{info}</Text> : null}

          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && styles.primaryBtnPressed,
              (sending || cooldownSeconds > 0) && styles.primaryBtnDisabled,
            ]}
            onPress={handleSendResetEmail}
            disabled={sending || verifying || cooldownSeconds > 0}
          >
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {cooldownSeconds > 0
                  ? `Resend Available in ${cooldownSeconds}s`
                  : emailSent
                    ? "Resend Reset Email"
                    : "Send Reset Email"}
              </Text>
            )}
          </Pressable>

          {!showCodeSection ? (
            <Pressable
              style={({ pressed }) => [
                styles.secondaryToggleBtn,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => setShowCodeSection(true)}
            >
              <Text style={styles.secondaryToggleText}>
                Already have a recovery code or link?
              </Text>
            </Pressable>
          ) : (
            <View style={styles.recoverySection}>
              <View style={styles.divider} />
              <Text style={styles.label}>Recovery Code or Reset Link</Text>
              <Text style={styles.subHint}>
                Enter the verification code from your email, or paste the reset
                link if you opened your email on another device.
              </Text>
              <TextInput
                style={styles.input}
                value={recoveryInput}
                onChangeText={setRecoveryInput}
                placeholder="Enter code or paste reset link"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Pressable
                style={({ pressed }) => [
                  styles.outlineBtn,
                  pressed && styles.primaryBtnPressed,
                  verifying && styles.primaryBtnDisabled,
                ]}
                onPress={handleVerifyRecovery}
                disabled={verifying || sending}
              >
                {verifying ? (
                  <ActivityIndicator color="#1C5141" />
                ) : (
                  <Text style={styles.outlineBtnText}>
                    Verify & Set New Password
                  </Text>
                )}
              </Pressable>
            </View>
          )}

          <View style={styles.footer}>
            <Text style={styles.footerText}>Remember your password? </Text>
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
    fontSize: 48,
    lineHeight: 56,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -1.2,
    marginBottom: 2,
  },
  title: {
    fontSize: 30,
    lineHeight: 38,
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
  helperText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#475569",
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 6,
  },
  subHint: {
    fontSize: 13,
    lineHeight: 18,
    color: "#64748b",
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#0f172a",
    backgroundColor: "#fff",
    marginBottom: 14,
  },
  error: {
    color: "#dc2626",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  info: {
    color: "#166534",
    backgroundColor: "#dcfce7",
    borderRadius: 10,
    padding: 12,
    fontSize: 13.5,
    lineHeight: 19,
    marginBottom: 12,
  },
  primaryBtn: {
    backgroundColor: "#1C5141",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
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
    fontWeight: "700",
  },
  secondaryToggleBtn: {
    marginTop: 14,
    paddingVertical: 6,
    alignItems: "center",
  },
  secondaryToggleText: {
    color: "#1C5141",
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  recoverySection: {
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 16,
  },
  outlineBtn: {
    borderWidth: 2,
    borderColor: "#1C5141",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  outlineBtnText: {
    color: "#1C5141",
    fontSize: 15,
    fontWeight: "700",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 18,
    flexWrap: "wrap",
  },
  footerText: {
    fontSize: 15,
    color: "#1f2937",
  },
  link: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1C5141",
    textDecorationLine: "underline",
  },
});
