import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AuthBackButton } from "@/components/AuthBackButton";
import { useAuth } from "@/contexts/AuthContext";

export default function ChooseAuthScreen() {
  const router = useRouter();
  const { loginAsGuest } = useAuth();

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <AuthBackButton />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>How would you like to continue?</Text>
        <Text style={styles.subtitle}>
          Sign in if you already have an account, or create a new one.
        </Text>

        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && styles.btnPressed,
          ]}
          onPress={() => router.push("/login")}
        >
          <Text style={styles.primaryBtnText}>Sign in</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.outlineBtn,
            pressed && styles.btnPressed,
          ]}
          onPress={() => router.push("/signup")}
        >
          <Text style={styles.outlineBtnText}>Sign up</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.guestBtn,
            pressed && styles.btnPressed,
          ]}
          onPress={async () => {
            await loginAsGuest();
            router.replace("/(main)");
          }}
        >
          <Text style={styles.guestBtnText}>Continue as Guest (Skip login)</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  topBar: {
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    justifyContent: "center",
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: "#64748b",
    marginBottom: 32,
    textAlign: "center",
  },
  primaryBtn: {
    backgroundColor: "#1B4332",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginBottom: 12,
  },
  outlineBtn: {
    borderWidth: 2,
    borderColor: "#1B4332",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  btnPressed: {
    opacity: 0.88,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  outlineBtnText: {
    color: "#1B4332",
    fontSize: 16,
    fontWeight: "600",
  },
  guestBtn: {
    marginTop: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  guestBtnText: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
