import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useEffect } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { TravelProvider } from "@/contexts/TravelContext";

const GREEN = "#1B4332";

export default function MainLayout() {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) {
      router.replace("/welcome");
    }
  }, [loading, router, session]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1B4332" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1B4332" />
      </View>
    );
  }

  return (
    <TravelProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: GREEN,
          tabBarInactiveTintColor: "#868e96",
          tabBarLabelStyle: { fontSize: 11 },
          tabBarStyle: {
            borderTopWidth: 1,
            borderTopColor: "#e9ecef",
            backgroundColor: "#fff",
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home" size={size ?? 22} color={typeof color === "number" ? GREEN : color ?? GREEN} />
            ),
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: "Search",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="compass-outline" size={size ?? 24} color={typeof color === "number" ? GREEN : color ?? GREEN} />
            ),
          }}
        />
        <Tabs.Screen
          name="saved"
          options={{
            title: "History",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="time-outline" size={size ?? 22} color={typeof color === "number" ? GREEN : color ?? GREEN} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person-outline" size={size ?? 24} color={typeof color === "number" ? GREEN : color ?? GREEN} />
            ),
          }}
        />
        {/* Keep Schedule reachable from Profile, but never render it in the tab bar. */}
        <Tabs.Screen
          name="schedule"
          options={{
            href: null,
          }}
        />
      </Tabs>
    </TravelProvider>
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
