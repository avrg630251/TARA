import { useRouter } from "expo-router";
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useState } from "react";

const GREEN = "#1C5141";
const WHITE = "#FFFFFF";
const jeepneyAsset = require("../../assets/images/jeepney.png");

export default function WelcomeScreen() {
  const router = useRouter();
  const [jeepneyTranslateX] = useState(() => new Animated.Value(-280));
  const [jeepneyOpacity] = useState(() => new Animated.Value(0));
  const [jeepneyScale] = useState(() => new Animated.Value(0.9));
  const [contentOpacity] = useState(() => new Animated.Value(0));
  const [contentTranslateY] = useState(() => new Animated.Value(16));

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(jeepneyOpacity, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(jeepneyTranslateX, {
          toValue: 0,
          duration: 760,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(jeepneyScale, {
          toValue: 1,
          damping: 10,
          stiffness: 130,
          mass: 0.8,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(contentTranslateY, {
          toValue: 0,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [
    contentOpacity,
    contentTranslateY,
    jeepneyOpacity,
    jeepneyScale,
    jeepneyTranslateX,
  ]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.root}>
        <Animated.View
          style={[
            styles.heroWrap,
            {
              opacity: jeepneyOpacity,
              transform: [
                { translateX: jeepneyTranslateX },
                { scale: jeepneyScale },
              ],
            },
          ]}
        >
          <Image
            source={jeepneyAsset}
            style={styles.heroImage}
            resizeMode="contain"
            accessibilityLabel="TARA jeepney"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.content,
            {
              opacity: contentOpacity,
              transform: [{ translateY: contentTranslateY }],
            },
          ]}
        >
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
        </Animated.View>
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
    height: 100,
  },
  content: {
    alignItems: "center",
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
