import { useRouter, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { supabase } from "@/lib/supabase";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string;
    error?: string;
    error_description?: string;
  }>();
  const [message, setMessage] = useState("Confirming your email address...");

  useEffect(() => {
    let cancelled = false;

    async function completeSignIn() {
      if (params.error || params.error_description) {
        if (!cancelled) {
          setMessage(
            params.error_description ??
              params.error ??
              "Email confirmation failed."
          );
        }
        return;
      }

      if (!params.code) {
        if (!cancelled) {
          setMessage(
            "This confirmation link is missing its verification code. Request a new email and try again."
          );
        }
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(params.code);
      if (cancelled) return;

      if (error) {
        setMessage(error.message);
        return;
      }

      router.replace("/");
    }

    void completeSignIn();
    return () => {
      cancelled = true;
    };
  }, [params.code, params.error, params.error_description, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#1B4332" />
      <Text style={styles.message}>{message}</Text>
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
});
