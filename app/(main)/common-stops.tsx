import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { COMMON_STOP_PRESETS } from "@/lib/commonStops";

const GREEN = "#1B4332";

export default function CommonStopsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.container}>
        <Text style={styles.title}>Common Stops</Text>
        <Text style={styles.subtitle}>
          Quick route presets for your usual campus trips.
        </Text>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {COMMON_STOP_PRESETS.map((preset) => (
            <Pressable
              key={preset.id}
              onPress={() =>
                router.push({
                  pathname: "/search",
                  params: {
                    origin: preset.origin,
                    destination: preset.destination,
                  },
                })
              }
              style={({ pressed }) => [
                styles.card,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.cardHeader}>
                <Ionicons name="location" size={18} color={GREEN} />
                <Text style={styles.cardTitle}>{preset.label}</Text>
              </View>

              <Text style={styles.routeText}>{preset.routeSummary}</Text>

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Board:</Text>
                <Text style={styles.metaValue}>{preset.boardStop}</Text>
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Get off:</Text>
                <Text style={styles.metaValue}>{preset.offStop}</Text>
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Walk:</Text>
                <Text style={styles.metaValue}>{preset.walkAfter}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  container: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: GREEN,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#495057",
    marginBottom: 18,
  },
  content: {
    gap: 14,
    paddingBottom: 28,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d5e8dc",
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  cardPressed: {
    opacity: 0.94,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: GREEN,
  },
  routeText: {
    fontSize: 14,
    color: "#334155",
    lineHeight: 20,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 4,
  },
  metaLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: GREEN,
    minWidth: 54,
  },
  metaValue: {
    flex: 1,
    fontSize: 13,
    color: "#495057",
    lineHeight: 18,
  },
});
