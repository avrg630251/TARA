import type { EmailOtpType } from "@supabase/supabase-js";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

function readWebHashParams(): Record<string, string> {
  if (Platform.OS !== "web" || typeof window === "undefined") return {};
  const hash = window.location.hash;
  if (!hash || hash.length <= 1) return {};
  const out: Record<string, string> = {};
  const search = new URLSearchParams(hash.slice(1));
  search.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { markPasswordRecovery } = useAuth();
  const params = useLocalSearchParams<{
    code?: string;
    token_hash?: string;
    token?: string;
    type?: string;
    error?: string;
    error_description?: string;
  }>();
  const [message, setMessage] = useState("Verifying your link...");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function completeAuthCallback() {
      const hashParams = readWebHashParams();
      const errDesc =
        params.error_description ||
        hashParams.error_description ||
        params.error ||
        hashParams.error;

      if (errDesc) {
        if (!cancelled) {
          setFailed(true);
          setMessage(errDesc);
        }
        return;
      }

      const flowType = (params.type || hashParams.type || "").toLowerCase();
      const isRecovery = flowType === "recovery";
      if (isRecovery) {
        markPasswordRecovery();
      }

      // 1. Implicit hash tokens (#access_token=...&refresh_token=...)
      if (hashParams.access_token && hashParams.refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token: hashParams.access_token,
          refresh_token: hashParams.refresh_token,
        });
        if (cancelled) return;
        if (error) {
          setFailed(true);
          setMessage(error.message);
          return;
        }
        router.replace((isRecovery ? "/auth/reset-password" : "/") as any);
        return;
      }

      // 2. PKCE code (?code=...)
      if (params.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(
          params.code
        );
        if (cancelled) return;
        if (error) {
          setFailed(true);
          setMessage(error.message);
          return;
        }
        router.replace((isRecovery ? "/auth/reset-password" : "/") as any);
        return;
      }

      // 3. Token hash (?token_hash=... or ?token=...)
      const tokenHash = params.token_hash || params.token;
      if (tokenHash) {
        const otpType: EmailOtpType = isRecovery ? "recovery" : "signup";
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: otpType,
        });
        if (cancelled) return;
        if (error) {
          setFailed(true);
          setMessage(error.message);
          return;
        }
        router.replace((isRecovery ? "/auth/reset-password" : "/") as any);
        return;
      }

      if (!cancelled) {
        setFailed(true);
        setMessage(
          "This verification link is missing its security code or has expired. Please request a new email and try again."
        );
      }
    }

    void completeAuthCallback();
    return () => {
      cancelled = true;
    };
  }, [
    markPasswordRecovery,
    params.code,
    params.error,
    params.error_description,
    params.token,
    params.token_hash,
    params.type,
    router,
  ]);

  return (
    <View style={styles.container}>
      {!failed ? <ActivityIndicator size="large" color="#1B4332" /> : null}
      <Text style={styles.message}>{message}</Text>
      {failed ? (
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.85 }]}
          onPress={() => router.replace("/login")}
        >
          <Text style={styles.backBtnText}>Back to Sign In</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f8fafc",
  },
  message: {
    maxWidth: 360,
    marginTop: 18,
    color: "#1f2937",
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  backBtn: {
    marginTop: 20,
    backgroundColor: "#1C5141",
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
  },
  backBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
});
