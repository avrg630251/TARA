import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useAuth } from "@/contexts/AuthContext";

export default function Index() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1B4332" />
      </View>
    );
  }

  if (session) {
    return <Redirect href="/(main)" />;
  }

  return <Redirect href="/welcome" />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
  },
});
