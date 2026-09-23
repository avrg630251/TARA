import { Stack, useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useEffect } from "react";

import { useAuth } from "@/contexts/AuthContext";

export default function AuthLayout() {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && session) {
      router.replace("/(main)");
    }
  }, [loading, router, session]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1B4332" />
      </View>
    );
  }

  if (session) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1B4332" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#f8fafc" },
      }}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
  },
});
