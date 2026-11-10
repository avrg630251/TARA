import { Ionicons } from "@expo/vector-icons";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
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
import { getManagedUsers, recordRegisteredUser } from "@/lib/adminAndFeedback";
import { supabase } from "@/lib/supabase";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRateLimitError(err: { message?: string; status?: number } | null): boolean {
  if (!err) return false;
  if (err.status === 429) return true;
  const msg = (err.message || "").toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("email rate exceeded") ||
    msg.includes("over_email_send_rate_limit") ||
    msg.includes("too many requests") ||
    msg.includes("for security purposes, you can only request this")
  );
}

export default function SignupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; step?: string }>();
  const { loginAsGuest } = useAuth();

  const [step, setStep] = useState<"form" | "otp" | "confirmed">(
    params.step === "otp" ? "otp" : "form"
  );
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(
    typeof params.email === "string" ? params.email : ""
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    if (typeof params.email === "string" && params.email.trim()) {
      setEmail(params.email.trim());
    }
    if (params.step === "otp") {
      setStep("otp");
      setInfo(
        "Enter the 6-digit verification code sent to your email address to activate your account."
      );
    }
  }, [params.email, params.step]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  async function onSubmit() {
    setError(null);
    setInfo(null);
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName || !trimmedEmail || !password) {
      setError("Enter your full name, email, and password.");
      return;
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
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

    // 1. Pre-check if email is already registered in local cache or Supabase profiles
    try {
      const localUsers = await getManagedUsers();
      if (
        localUsers.some(
          (u) => u.email.trim().toLowerCase() === trimmedEmail
        )
      ) {
        setSubmitting(false);
        setError("User already registered");
        return;
      }

      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", trimmedEmail)
        .maybeSingle();

      if (existingProfile) {
        setSubmitting(false);
        setError("User already registered");
        return;
      }
    } catch {
      // Continue to auth.signUp if table query is restricted
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        data: {
          full_name: trimmedName,
          role: "user",
        },
      },
    });
    setSubmitting(false);

    if (signUpError) {
      const msg = signUpError.message.toLowerCase();
      if (isRateLimitError(signUpError)) {
        setCooldownSeconds(60);
        setStep("otp");
        setInfo(
          "A verification email was recently sent to your address. Please check your inbox (and spam folder) for the 6-digit OTP code, or wait 60 seconds before requesting a new code."
        );
        return;
      }
      if (
        msg.includes("already registered") ||
        msg.includes("already been registered") ||
        msg.includes("user already exists") ||
        (signUpError.status === 400 &&
          (msg.includes("user") || msg.includes("email")))
      ) {
        setError("User already registered");
      } else {
        setError(signUpError.message);
      }
      return;
    }

    // 2. Supabase GoTrue returns empty identities array when email is already registered
    if (
      data.user &&
      Array.isArray(data.user.identities) &&
      data.user.identities.length === 0
    ) {
      setError("User already registered");
      return;
    }

    if (data.user) {
      setPendingUserId(data.user.id);
      await recordRegisteredUser({
        id: data.user.id,
        email: trimmedEmail,
        fullName: trimmedName,
        role: "user",
        joinedAt: data.user.created_at || new Date().toISOString(),
      });
    }

    // If email confirmation is disabled on the server and session is granted immediately
    if (data.session) {
      return;
    }

    // Transition to Step 2: 6-digit OTP verification
    setOtpCode("");
    setCooldownSeconds(60);
    setStep("otp");
    setInfo(
      `We've sent a 6-digit verification code to ${trimmedEmail}. Please check your inbox (and spam or junk folder) and enter the code below to activate your account.`
    );
  }

  async function onVerifyOtp() {
    setError(null);
    setInfo(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) {
      setError("Please enter the email address you registered with.");
      return;
    }

    const cleanCode = otpCode.replace(/\s+/g, "").trim();
    if (!cleanCode) {
      setError("Please enter the 6-digit verification code sent to your email.");
      return;
    }
    if (!/^\d{6}$/.test(cleanCode)) {
      setError("Verification code must be a 6-digit number.");
      return;
    }

    setSubmitting(true);

    // 1. Verify signup OTP
    let verifyResult = await supabase.auth.verifyOtp({
      email: trimmedEmail,
      token: cleanCode,
      type: "signup",
    });

    // 2. Fallback to "email" OTP type in case user requested a magic/email OTP
    if (verifyResult.error) {
      const fallbackResult = await supabase.auth.verifyOtp({
        email: trimmedEmail,
        token: cleanCode,
        type: "email",
      });
      if (!fallbackResult.error) {
        verifyResult = fallbackResult;
      }
    }

    setSubmitting(false);

    if (verifyResult.error) {
      if (isRateLimitError(verifyResult.error)) {
        setError(
          "Too many verification attempts. Please wait a minute before trying again."
        );
      } else {
        setError(
          "Invalid or expired verification code. Please check the 6-digit code in your email or tap Resend Code."
        );
      }
      return;
    }

    const verifiedUser = verifyResult.data?.user;
    if (verifiedUser || pendingUserId) {
      await recordRegisteredUser({
        id: verifiedUser?.id || pendingUserId!,
        email: trimmedEmail,
        fullName:
          fullName.trim() ||
          (verifiedUser?.user_metadata?.full_name as string | undefined) ||
          trimmedEmail.split("@")[0],
        role: "user",
        joinedAt: verifiedUser?.created_at || new Date().toISOString(),
      });
    }

    setStep("confirmed");
  }

  async function onResendOtp() {
    if (cooldownSeconds > 0 || resending) return;
    setError(null);
    setInfo(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) {
      setError("Please enter a valid email address first.");
      return;
    }

    setResending(true);
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: trimmedEmail,
    });
    setResending(false);

    if (resendError) {
      if (isRateLimitError(resendError)) {
        setCooldownSeconds(60);
        setError(
          "Email rate limit reached. Please wait at least 60 seconds before requesting another verification code, or check your inbox for the code already sent."
        );
      } else {
        setError(resendError.message);
      }
      return;
    }

    setCooldownSeconds(60);
    setInfo(
      `A new 6-digit verification code has been sent to ${trimmedEmail}. Please check your inbox and spam folder.`
    );
  }

  return (
    <AuthScreen>
      <View style={styles.page}>
        <Text style={styles.brand}>TARA-neta</Text>
        <Text style={styles.title}>
          {step === "otp"
            ? "Verify Email"
            : step === "confirmed"
              ? "Account Verified"
              : "Sign Up"}
        </Text>

        <View style={styles.card}>
          {step === "form" && (
            <>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="e.g. Juan Dela Cruz"
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
                placeholder="you@example.com"
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

              <Pressable
                style={({ pressed }) => [
                  styles.secondaryLinkBtn,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => {
                  setError(null);
                  setInfo(
                    "Enter the email address you registered with and the 6-digit OTP code from your email."
                  );
                  setStep("otp");
                }}
              >
                <Ionicons
                  name="key-outline"
                  size={16}
                  color="#1C5141"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.secondaryLinkText}>
                  Already have an OTP verification code?
                </Text>
              </Pressable>

              <View style={styles.footer}>
                <Text style={styles.footerText}>Already have an account? </Text>
                <Link href="/login" asChild>
                  <Pressable>
                    <Text style={styles.link}>Sign In</Text>
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
                <Text style={styles.guestBtnText}>
                  Skip login · Continue as Guest
                </Text>
              </Pressable>
            </>
          )}

          {step === "otp" && (
            <>
              <View style={styles.otpBadgeRow}>
                <View style={styles.otpIconCircle}>
                  <Ionicons name="mail-open-outline" size={26} color="#1C5141" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.otpHeaderTitle}>
                    Enter Verification Code
                  </Text>
                  <Text style={styles.otpHeaderSub}>
                    Check your email for a 6-digit OTP code
                  </Text>
                </View>
              </View>

              {info ? <Text style={styles.info}>{info}</Text> : null}

              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <Text style={styles.label}>6-Digit OTP Code</Text>
              <TextInput
                style={styles.otpInput}
                value={otpCode}
                onChangeText={(val) =>
                  setOtpCode(val.replace(/[^0-9]/g, "").slice(0, 6))
                }
                placeholder="000000"
                placeholderTextColor="#cbd5e1"
                keyboardType="number-pad"
                maxLength={6}
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                accessibilityLabel="6-digit OTP verification code"
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && styles.primaryBtnPressed,
                  submitting && styles.primaryBtnDisabled,
                ]}
                onPress={onVerifyOtp}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    Verify & Activate Account
                  </Text>
                )}
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.resendBtn,
                  (cooldownSeconds > 0 || resending) && styles.resendBtnDisabled,
                  pressed && cooldownSeconds === 0 && { opacity: 0.75 },
                ]}
                onPress={onResendOtp}
                disabled={cooldownSeconds > 0 || resending}
              >
                {resending ? (
                  <ActivityIndicator size="small" color="#1C5141" />
                ) : (
                  <Text
                    style={[
                      styles.resendBtnText,
                      cooldownSeconds > 0 && styles.resendBtnTextDisabled,
                    ]}
                  >
                    {cooldownSeconds > 0
                      ? `Resend OTP Code in ${cooldownSeconds}s`
                      : "Didn't receive a code? Resend OTP"}
                  </Text>
                )}
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.backStepBtn,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => {
                  setError(null);
                  setInfo(null);
                  setStep("form");
                }}
              >
                <Ionicons name="arrow-back" size={16} color="#475569" />
                <Text style={styles.backStepBtnText}>
                  Back to Sign Up Details
                </Text>
              </Pressable>
            </>
          )}

          {step === "confirmed" && (
            <View style={styles.confirmedWrap}>
              <View style={styles.confirmedIconCircle}>
                <Ionicons name="checkmark-circle" size={54} color="#15803d" />
              </View>
              <Text style={styles.confirmedTitle}>
                Registration Confirmed!
              </Text>
              <Text style={styles.confirmedText}>
                Your email has been verified and your TARA-neta account is now
                active. You can now sign in and start planning your campus
                commute.
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { width: "100%" },
                  pressed && styles.primaryBtnPressed,
                ]}
                onPress={() => router.replace("/(main)")}
              >
                <Text style={styles.primaryBtnText}>Continue to TARA-neta</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.backStepBtn,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => router.replace("/login")}
              >
                <Text style={styles.link}>Go to Sign In</Text>
              </Pressable>
            </View>
          )}
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
    fontSize: 16,
    fontWeight: "500",
    color: "#1f2937",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    color: "#0f172a",
    backgroundColor: "#fff",
    marginBottom: 16,
  },
  otpBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  otpIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#e6f4ea",
    alignItems: "center",
    justifyContent: "center",
  },
  otpHeaderTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
  },
  otpHeaderSub: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 2,
  },
  otpInput: {
    borderWidth: 2,
    borderColor: "#1C5141",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 10,
    textAlign: "center",
    color: "#0f172a",
    backgroundColor: "#f8fafc",
    marginBottom: 16,
  },
  error: {
    color: "#dc2626",
    fontSize: 14,
    marginBottom: 12,
    lineHeight: 20,
  },
  info: {
    color: "#166534",
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 10,
    padding: 12,
    fontSize: 13.5,
    marginBottom: 14,
    lineHeight: 19,
  },
  primaryBtn: {
    backgroundColor: "#1C5141",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 6,
  },
  primaryBtnPressed: {
    opacity: 0.9,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  secondaryLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
    paddingVertical: 8,
    backgroundColor: "#f0fdf4",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  secondaryLinkText: {
    color: "#1C5141",
    fontSize: 14,
    fontWeight: "600",
  },
  resendBtn: {
    marginTop: 14,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1C5141",
    alignItems: "center",
  },
  resendBtnDisabled: {
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },
  resendBtnText: {
    color: "#1C5141",
    fontSize: 14,
    fontWeight: "600",
  },
  resendBtnTextDisabled: {
    color: "#94a3b8",
  },
  backStepBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 14,
    paddingVertical: 8,
  },
  backStepBtnText: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "600",
  },
  confirmedWrap: {
    alignItems: "center",
    paddingVertical: 12,
  },
  confirmedIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#dcfce7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  confirmedTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 8,
    textAlign: "center",
  },
  confirmedText: {
    fontSize: 14.5,
    color: "#475569",
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 20,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 18,
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
    marginTop: 12,
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
