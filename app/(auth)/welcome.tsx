import { useRouter } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GREEN = "#1C5141";
const WHITE = "#FFFFFF";
const imgAnimation =
  "https://www.figma.com/api/mcp/asset/fa7d3011-866a-49bc-9844-39e1712e69cc.png";

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.root}>
        <View style={styles.heroWrap}>
          <Image
            source={{ uri: imgAnimation }}
            style={styles.heroImage}
            resizeMode="cover"
          />
        </View>

        <Text style={styles.title}>TARA!</Text>

        <Pressable
          style={({ pressed }) => [
            styles.primary,
            pressed && styles.primaryPressed,
          ]}
          onPress={() => router.push("/choose")}
          accessibilityRole="button"
          accessibilityLabel="Get started"
        >
          <Text style={styles.primaryText}>GET STARTED</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: WHITE,
  },
  root: {
    flex: 1,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 6,
  },
  heroWrap: {
    width: 240,
    height: 226,
    marginTop: 26,
    marginBottom: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  heroImage: {
    width: 240,
    height: 226,
  },
  title: {
    fontSize: 48,
    lineHeight: 48,
    color: GREEN,
    fontWeight: "700",
    letterSpacing: -0.48,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 18,
    fontFamily: "System",
  },
  primary: {
    width: 278,
    height: 51,
    backgroundColor: GREEN,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  primaryPressed: {
    opacity: 0.96,
  },
  primaryText: {
    color: WHITE,
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 0,
    fontFamily: "System",
  },
});
