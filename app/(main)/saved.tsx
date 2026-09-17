import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMemo, useState } from "react";

import { useTravel } from "@/contexts/TravelContext";
import { FullScreenMap } from "@/components/FullScreenMap";

const GREEN = "#1B4332";
const BORDER = "#e9ecef";

type RouteFilter = "all" | "fastest" | "cheapest";

export default function SavedScreen() {
  const router = useRouter();
  const { bookmarks, recentTrips } = useTravel();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RouteFilter>("all");
  const isDesktop = width >= 768;

  const items = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const list = [
      ...bookmarks.map((b) => ({
        key: b.key,
        title: b.routeName || `${b.originLabel} - ${b.destinationLabel}`,
        from: b.originLabel,
        to: b.destinationLabel,
        meta: `${b.estimatedText} · ${b.fareText}`,
        board: b.boardStop,
        off: b.offStop,
        polyline: b.polyline,
        savedAt: b.savedAt,
        badge: "FASTEST" as const,
      })),
      ...recentTrips.map((t) => ({
        key: t.key,
        title: t.routeName || `${t.originLabel} - ${t.destinationLabel}`,
        from: t.originLabel,
        to: t.destinationLabel,
        meta: `${t.etaText} · ${t.routeName}`,
        board: t.boardStop,
        off: t.offStop,
        polyline: undefined,
        savedAt: t.startedAt,
        badge: "CHEAPEST" as const,
      })),
    ];

    const filtered = normalizedQuery
      ? list.filter(({ title, from, to }) => {
          const haystack = `${title} ${from} ${to}`.toLowerCase();
          return haystack.includes(normalizedQuery);
        })
      : list;

    if (filter === "fastest") {
      return filtered.filter((item) => item.badge === "FASTEST");
    }

    if (filter === "cheapest") {
      return filtered.filter((item) => item.badge === "CHEAPEST");
    }

    return filtered;
  }, [bookmarks, filter, query, recentTrips]);

  function openSearch(origin: string, destination: string) {
    router.push({
      pathname: "/search",
      params: { origin, destination },
    });
  }

  function formatSavedDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Saved trip";
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={[styles.container, isDesktop && styles.desktopContainer]}>
        <View style={[styles.contentShell, isDesktop && styles.desktopShell]}>
          <View style={styles.headerRow}>
            <Pressable
              style={styles.backButton}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={26} color={GREEN} />
            </Pressable>
            <Text style={styles.title}>History</Text>
          </View>

          <View style={styles.searchBox}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor="#94a3b8"
              style={styles.searchInput}
              accessibilityLabel="Search route history"
            />
            <Ionicons name="search-outline" size={20} color="#64748b" />
          </View>

          <View style={styles.filterRow}>
            {[
              { label: "All", value: "all" },
              { label: "Fastest Routes", value: "fastest" },
              { label: "Cheapest Routes", value: "cheapest" },
            ].map((option) => {
              const selected = filter === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.filterChip, selected && styles.filterChipActive]}
                  onPress={() => setFilter(option.value as RouteFilter)}
                >
                  <Text style={[styles.filterText, selected && styles.filterTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
          {items.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No route history yet.</Text>
            </View>
          ) : (
            items.map((item) => (
              <View key={item.key} style={styles.tripCard}>
                <View style={styles.tripCardHeader}>
                  <Text style={styles.tripDate}>
                    {formatSavedDate(item.savedAt)}
                  </Text>
                  <Text style={styles.tripTime}>
                    {item.badge === "FASTEST" ? "Bookmarked route" : "Completed trip"}
                  </Text>
                </View>

                <View style={styles.mapPreview}>
                  {"polyline" in item && item.polyline && item.polyline.length > 1 ? (
                    <FullScreenMap
                      latitude={item.polyline[0].latitude}
                      longitude={item.polyline[0].longitude}
                      polylineCoordinates={item.polyline}
                      destinationCoordinate={item.polyline.at(-1)}
                      fitEdgePadding={{ top: 24, right: 24, bottom: 24, left: 24 }}
                    />
                  ) : (
                    <View style={styles.mapUnavailable}>
                      <Ionicons name="map-outline" size={38} color="#8aa49b" />
                      <Text style={styles.mapUnavailableText}>Route map preview</Text>
                    </View>
                  )}
                </View>

                <View style={styles.tripBody}>
                  <View style={styles.statusPill}>
                    <Ionicons name="checkmark-circle" size={14} color="#fff" />
                    <Text style={styles.statusText}>{item.badge === "FASTEST" ? "Saved" : "Completed"}</Text>
                  </View>

                  <Text style={styles.locationText}>{"\u{1F4CD}"} {item.from}</Text>
                  <Text style={styles.locationText}>{"\u{2691}"} {item.to}</Text>

                  <View style={styles.metricsGrid}>
                    <View style={styles.metricBox}>
                      <Text style={styles.metricLabel}>◷ Duration</Text>
                      <Text style={styles.metricValue}>{item.meta.split(" · ")[0]}</Text>
                    </View>
                    <View style={styles.metricBox}>
                      <Text style={styles.metricLabel}>⇢ Route</Text>
                      <Text style={styles.metricValue} numberOfLines={1}>{item.title}</Text>
                    </View>
                    <View style={styles.metricBox}>
                      <Text style={styles.metricLabel}>⇄ Transfers</Text>
                      <Text style={styles.metricValue}>Board: {item.board}</Text>
                    </View>
                    <View style={styles.metricBox}>
                      <Text style={styles.metricLabel}>₱ Est. Fare</Text>
                      <Text style={styles.metricValue}>{item.meta.split(" · ")[1] ?? "—"}</Text>
                    </View>
                  </View>

                  <View style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>Estimated Fare Breakdown</Text>
                    <View style={styles.fareRow}>
                      <Text style={styles.fareLabel}>Total</Text>
                      <Text style={styles.fareValue}>{item.meta.split(" · ")[1] ?? "—"}</Text>
                    </View>
                  </View>

                  <View style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>Step-by-Step Instructions</Text>
                    <Text style={styles.instructionText}>Board at {item.board}</Text>
                    <Text style={styles.instructionText}>Get off at {item.off}</Text>
                  </View>

                  <Pressable
                    style={styles.primaryButton}
                    onPress={() => openSearch(item.from, item.to)}
                  >
                    <Ionicons name="repeat" size={18} color="#fff" />
                    <Text style={styles.primaryButtonText}>Repeat this trip</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
          </ScrollView>
        </View>
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
    backgroundColor: "#f8fafc",
    paddingHorizontal: 18,
  },
  desktopContainer: {
    alignItems: "center",
    paddingHorizontal: 24,
  },
  contentShell: {
    width: "100%",
    maxWidth: 920,
  },
  desktopShell: {
    paddingTop: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    paddingHorizontal: 8,
  },
  backButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    textAlign: "center",
    marginRight: 38,
    fontSize: 32,
    fontWeight: "700",
    color: GREEN,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f7f8",
    borderColor: "#dbe2e8",
    borderWidth: 1,
    borderRadius: 18,
    height: 48,
    paddingHorizontal: 16,
    marginTop: 18,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    color: "#1f2937",
    fontSize: 16,
    paddingRight: 12,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#edf1f3",
    borderRadius: 16,
    padding: 4,
    marginBottom: 18,
  },
  filterChip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 38,
    borderRadius: 12,
    backgroundColor: "transparent",
  },
  filterChipActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  filterText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
  },
  filterTextActive: {
    color: GREEN,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 32,
  },
  routeCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  tripCard: {
    backgroundColor: "#f7f7f7",
    borderRadius: 18,
    marginBottom: 18,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  tripCardHeader: {
    backgroundColor: GREEN,
    minHeight: 58,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tripDate: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  tripTime: {
    color: "#d8eee5",
    fontSize: 11,
    marginTop: 2,
  },
  mapPreview: {
    height: 170,
    margin: 10,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#e5ece9",
    position: "relative",
  },
  mapUnavailable: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  mapUnavailableText: {
    color: "#6b8b80",
    fontSize: 12,
    marginTop: 6,
  },
  tripBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  statusPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 12,
    backgroundColor: GREEN,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginBottom: 8,
  },
  statusText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  locationText: {
    color: "#1f2937",
    fontSize: 14,
    marginBottom: 7,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 5,
    marginBottom: 10,
  },
  metricBox: {
    width: "48%",
    minHeight: 52,
    borderRadius: 6,
    backgroundColor: "#245f4f",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  metricLabel: {
    color: "#d8eee5",
    fontSize: 10,
    marginBottom: 3,
  },
  metricValue: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 13,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e4e7e6",
  },
  sectionTitle: {
    color: "#245f4f",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 8,
  },
  fareLabel: {
    color: "#374151",
    fontSize: 12,
  },
  fareValue: {
    color: "#245f4f",
    fontSize: 12,
    fontWeight: "700",
  },
  instructionText: {
    color: "#475569",
    fontSize: 12,
    marginTop: 5,
  },
  cardIconWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  routeIconOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#eaf1ee",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  routeIconInner: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#eaf1ee",
    justifyContent: "center",
    alignItems: "center",
  },
  routeDetails: {
    marginBottom: 10,
  },
  routeTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1f2937",
    marginBottom: 6,
    lineHeight: 26,
  },
  routeMeta: {
    fontSize: 14,
    color: "#475569",
    lineHeight: 20,
  },
  metaRow: {
    marginTop: 6,
    marginBottom: 2,
  },
  metaText: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "600",
  },
  microText: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 2,
  },
  primaryButton: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: GREEN,
    borderRadius: 14,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyText: {
    color: "#64748b",
    fontSize: 15,
  },
});
