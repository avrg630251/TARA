import { useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useEffect } from "react";

import { useAuth } from "@/contexts/AuthContext";

export default function Index() {
  const { session, loading, isGuest } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      router.replace(session || isGuest ? "/(main)" : "/welcome");
    }
  }, [loading, router, session, isGuest]);

  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color="#1B4332" />
    </View>
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
