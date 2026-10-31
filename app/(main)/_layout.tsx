import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useEffect } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { TravelProvider } from "@/contexts/TravelContext";

const GREEN = "#1B4332";

export default function MainLayout() {
  const { session, loading, isAdmin, isGuest } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session && !isGuest) {
      router.replace("/welcome");
    }
  }, [loading, router, session, isGuest]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1B4332" />
      </View>
    );
  }

  if (!session && !isGuest) {
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
            href: isGuest ? null : undefined,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="time-outline" size={size ?? 22} color={typeof color === "number" ? GREEN : color ?? GREEN} />
            ),
          }}
        />
        <Tabs.Screen
          name="schedule"
          options={{
            title: "Schedule",
            href: isGuest ? null : undefined,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="calendar-outline" size={size ?? 22} color={typeof color === "number" ? GREEN : color ?? GREEN} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            href: isGuest ? null : undefined,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person-outline" size={size ?? 24} color={typeof color === "number" ? GREEN : color ?? GREEN} />
            ),
          }}
        />
        <Tabs.Screen
          name="admin"
          options={{
            title: "Admin",
            href: isAdmin ? ("/(main)/admin" as any) : null,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="shield-checkmark-outline" size={size ?? 22} color={typeof color === "number" ? GREEN : color ?? GREEN} />
            ),
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
