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

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={[styles.container, isDesktop && styles.desktopContainer]}>
        <View style={[styles.contentShell, isDesktop && styles.desktopShell]}>
          <View style={styles.headerRow}>
            <Pressable style={styles.backButton} accessibilityLabel="Go back">
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
              <View key={item.key} style={styles.routeCard}>
                <View style={styles.cardIconWrap}>
                  <View style={styles.routeIconOuter}>
                    <Ionicons name="location-outline" size={18} color={GREEN} />
                  </View>
                  <View style={styles.routeIconInner}>
                    <Ionicons name="location-outline" size={18} color={GREEN} />
                  </View>
                </View>

                <View style={styles.routeDetails}>
                  <Text style={styles.routeTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.routeMeta} numberOfLines={1}>
                    {item.from}
                  </Text>
                  <Text style={styles.routeMeta} numberOfLines={1}>
                    {item.to}
                  </Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>{item.meta}</Text>
                  </View>
                  <Text style={styles.microText}>Board: {item.board}</Text>
                  <Text style={styles.microText}>Get off: {item.off}</Text>
                </View>

                <Pressable
                  style={styles.primaryButton}
                  onPress={() => openSearch(item.from, item.to)}
                >
                  <Text style={styles.primaryButtonText}>View More Details</Text>
                </Pressable>
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
