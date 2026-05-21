import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GREEN = "#1B4332";

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <View style={styles.headerShell}>
        <SafeAreaView edges={["top"]} style={styles.headerSafe}>
          <View style={styles.headerInner}>
            <Text style={styles.brand}>TARA</Text>
            <Text style={styles.greeting}>Welcome</Text>
            <Text style={styles.tagline}>
              Plan trips, pick a destination, and find transit options when you
              are nearby.
            </Text>
          </View>
        </SafeAreaView>
      </View>

      <View style={styles.lower}>
        <Pressable
          style={({ pressed }) => [
            styles.primary,
            pressed && styles.primaryPressed,
          ]}
          onPress={() => router.push("/choose")}
          accessibilityRole="button"
          accessibilityLabel="Get started"
        >
          <Text style={styles.primaryText}>Get started</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#fff",
  },
  headerShell: {
    backgroundColor: GREEN,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: "hidden",
  },
  headerSafe: {
    backgroundColor: GREEN,
  },
  headerInner: {
    paddingHorizontal: 28,
    paddingTop: 12,
    paddingBottom: 36,
  },
  brand: {
    fontSize: 40,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 4,
    marginBottom: 12,
  },
  greeting: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 14,
  },
  tagline: {
    fontSize: 16,
    lineHeight: 25,
    color: "rgba(255,255,255,0.92)",
    maxWidth: 380,
  },
  lower: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 40,
    justifyContent: "flex-end",
    maxWidth: 420,
    width: "100%",
    alignSelf: "center",
  },
  primary: {
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  primaryPressed: {
    opacity: 0.9,
  },
  primaryText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
});
