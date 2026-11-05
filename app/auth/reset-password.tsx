import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AuthScreen } from "@/components/AuthScreen";
import { PasswordField } from "@/components/PasswordField";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { session, clearPasswordRecovery, signOut } = useAuth();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  async function handleUpdatePassword() {
    setError(null);

    if (!newPassword || !confirmPassword) {
      setError("Enter and confirm your new password.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!session) {
      setError(
        "Your password reset session expired or is missing. Please request a new reset email."
      );
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    clearPasswordRecovery();
    await signOut();
    setCompleted(true);
  }

  return (
    <AuthScreen>
      <View style={styles.page}>
        <Text style={styles.brand}>TARA-neta</Text>
        <Text style={styles.title}>Reset Password</Text>

        <View style={styles.card}>
          {completed ? (
            <View style={styles.successWrap}>
              <View style={styles.successIconCircle}>
                <Ionicons name="checkmark-circle" size={44} color="#166534" />
              </View>
              <Text style={styles.successTitle}>Password Updated!</Text>
              <Text style={styles.successBody}>
                Your password has been reset successfully. You can now sign in
                using your new password.
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { width: "100%" },
                  pressed && styles.primaryBtnPressed,
                ]}
                onPress={() => router.replace("/login")}
              >
                <Text style={styles.primaryBtnText}>Back to Sign In</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.helperText}>
                Enter your new password below. Make sure it is at least 8
                characters long.
              </Text>

              <Text style={styles.label}>New Password</Text>
              <PasswordField
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                textContentType="newPassword"
              />

              <Text style={styles.label}>Confirm New Password</Text>
              <PasswordField
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-enter new password"
                autoComplete="new-password"
                textContentType="newPassword"
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && styles.primaryBtnPressed,
                  submitting && styles.primaryBtnDisabled,
                ]}
                onPress={handleUpdatePassword}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Update Password</Text>
                )}
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.cancelBtn,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={async () => {
                  clearPasswordRecovery();
                  if (session) {
                    await signOut();
                  }
                  router.replace("/login");
                }}
              >
                <Text style={styles.cancelBtnText}>Cancel & Back to Sign In</Text>
              </Pressable>
            </>
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
  error: {
    color: "#dc2626",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
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
    fontSize: 16,
    fontWeight: "700",
  },
  cancelBtn: {
    marginTop: 14,
    paddingVertical: 8,
    alignItems: "center",
  },
  cancelBtnText: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  successWrap: {
    alignItems: "center",
    paddingVertical: 8,
  },
  successIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#dcfce7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 8,
  },
  successBody: {
    fontSize: 14,
    lineHeight: 21,
    color: "#475569",
    textAlign: "center",
    marginBottom: 20,
  },
});
