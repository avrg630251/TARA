import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCallback, useMemo, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useTravel } from "@/contexts/TravelContext";
import { normalizeTravelFare } from "@/lib/transitRoutes";

const GREEN = "#1B4332";

type HistoryFilter = "all" | "recent" | "saved";

type DisplayHistoryItem = {
  key: string;
  type: "recent" | "bookmark";
  title: string;
  from: string;
  to: string;
  meta: string;
  board: string;
  off: string;
  fareText: string;
  savedAt: string;
  badge: "COMPLETED TRIP" | "SAVED ROUTE";
};

export default function SavedScreen() {
  const router = useRouter();
  const { isGuest } = useAuth();
  const {
    ready,
    bookmarks,
    recentTrips,
    refreshTravelData,
    removeRecent,
    removeBookmark,
  } = useTravel();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const isDesktop = width >= 768;

  useFocusEffect(
    useCallback(() => {
      if (!isGuest) {
        void refreshTravelData();
      }
    }, [refreshTravelData, isGuest])
  );

  if (isGuest) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.guestLockedContainer}>
          <Ionicons name="lock-closed-outline" size={64} color="#94a3b8" />
          <Text style={styles.guestLockedTitle}>Sign In Required</Text>
          <Text style={styles.guestLockedSubtitle}>
            Trip history and bookmarked routes are saved to registered accounts. Please sign in or create an account to view and save routes.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.guestSignInBtn,
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => router.push("/welcome")}
          >
            <Text style={styles.guestSignInBtnText}>Sign In / Register</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const items = useMemo<DisplayHistoryItem[]>(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const recentList: DisplayHistoryItem[] = recentTrips.map((t) => {
      const normalized = normalizeTravelFare({
        routeName: t.routeName,
        originLabel: t.originLabel,
        destinationLabel: t.destinationLabel,
        boardStop: t.boardStop,
        offStop: t.offStop,
        fareText: t.fareText,
        fareValue: t.fareValue,
        segments: t.segments,
        polyline: t.polyline,
      });
      return {
        key: t.key,
        type: "recent",
        title: t.routeName || `${t.originLabel} - ${t.destinationLabel}`,
        from: t.originLabel || "Current Location",
        to: t.destinationLabel || "De La Salle Araneta University",
        meta: `${t.etaText} · ${t.routeName}`,
        board: t.boardStop || "Designated stop",
        off: t.offStop || "Destination",
        fareText: normalized.fareText,
        savedAt: t.startedAt,
        badge: "COMPLETED TRIP",
      };
    });

    const bookmarkList: DisplayHistoryItem[] = bookmarks.map((b) => {
      const normalized = normalizeTravelFare({
        routeName: b.routeName,
        originLabel: b.originLabel,
        destinationLabel: b.destinationLabel,
        boardStop: b.boardStop,
        offStop: b.offStop,
        fareText: b.fareText,
        fareValue: b.fareValue,
        segments: b.segments,
        polyline: b.polyline,
      });
      return {
        key: b.key,
        type: "bookmark",
        title: b.routeName || `${b.originLabel} - ${b.destinationLabel}`,
        from: b.originLabel || "Current Location",
        to: b.destinationLabel || "De La Salle Araneta University",
        meta: `${b.estimatedText} · ${normalized.fareText}`,
        board: b.boardStop || "Designated stop",
        off: b.offStop || "Destination",
        fareText: normalized.fareText,
        savedAt: b.savedAt,
        badge: "SAVED ROUTE",
      };
    });

    let combined: DisplayHistoryItem[] = [];
    if (filter === "recent") {
      combined = recentList;
    } else if (filter === "saved") {
      combined = bookmarkList;
    } else {
      combined = [...recentList, ...bookmarkList].sort(
        (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
      );
    }

    if (!normalizedQuery) return combined;

    return combined.filter(({ title, from, to }) => {
      const haystack = `${title} ${from} ${to}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [query, filter, recentTrips, bookmarks]);

  function openSearch(origin: string, destination: string) {
    router.push({
      pathname: "/search",
      params: { origin, destination },
    });
  }

  function handleDelete(item: DisplayHistoryItem) {
    Alert.alert(
      item.type === "recent" ? "Remove from history" : "Remove saved route",
      "Are you sure you want to delete this item?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            if (item.type === "recent") {
              removeRecent(item.key);
            } else {
              void removeBookmark(item.key);
            }
          },
        },
      ]
    );
  }

  function formatSavedDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Trip record";
    const datePart = date.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const timePart = date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${datePart} · ${timePart}`;
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
              placeholder="Search history or saved routes..."
              placeholderTextColor="#94a3b8"
              style={styles.searchInput}
              accessibilityLabel="Search route history"
            />
            <Ionicons name="search-outline" size={20} color="#64748b" />
          </View>

          <View style={styles.filterRow}>
            {(
              [
                { key: "all" as const, label: "All" },
                { key: "recent" as const, label: "Recent Trips" },
                { key: "saved" as const, label: "Saved Routes" },
              ] as const
            ).map((opt) => (
              <Pressable
                key={opt.key}
                onPress={() => setFilter(opt.key)}
                style={[
                  styles.filterChip,
                  filter === opt.key && styles.filterChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filter === opt.key && styles.filterChipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {!ready ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Loading history...</Text>
              </View>
            ) : items.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="time-outline" size={48} color="#94a3b8" />
                <Text style={styles.emptyTitle}>No history yet</Text>
                <Text style={styles.emptyText}>
                  {filter === "saved"
                    ? "Bookmark your preferred routes in Search to see them here."
                    : filter === "recent"
                      ? "Routes you start will automatically appear in your recent trips."
                      : "Search for a route and start a trip, or bookmark routes to easily find them later."}
                </Text>
              </View>
            ) : (
              items.map((item) => (
                <View key={item.key} style={styles.tripCard}>
                  <View style={styles.tripCardHeader}>
                    <View style={styles.tripCardHeaderLeft}>
                      <Text style={styles.tripDate}>
                        {formatSavedDate(item.savedAt)}
                      </Text>
                      <Text style={styles.tripTime}>
                        {item.type === "recent" ? "Completed Trip" : "Bookmarked Route"}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleDelete(item)}
                      hitSlop={8}
                      accessibilityLabel="Delete record"
                      style={styles.deleteBtn}
                    >
                      <Ionicons name="trash-outline" size={18} color="#fff" />
                    </Pressable>
                  </View>

                  <View style={styles.tripBody}>
                    <View
                      style={[
                        styles.statusPill,
                        item.type === "bookmark" && styles.statusPillSaved,
                      ]}
                    >
                      <Ionicons
                        name={item.type === "recent" ? "checkmark-circle" : "bookmark"}
                        size={14}
                        color="#fff"
                      />
                      <Text style={styles.statusText}>{item.badge}</Text>
                    </View>

                    <Text style={styles.locationText}>
                      {"\u{1F4CD}"} From: {item.from}
                    </Text>
                    <Text style={styles.locationText}>
                      {"\u{2691}"} To: {item.to}
                    </Text>

                    <View style={styles.metricsGrid}>
                      <View style={styles.metricBox}>
                        <Text style={styles.metricLabel}>Duration</Text>
                        <Text style={styles.metricValue}>
                          {item.meta.split(" · ")[0] || "—"}
                        </Text>
                      </View>
                      <View style={styles.metricBox}>
                        <Text style={styles.metricLabel}>Route</Text>
                        <Text style={styles.metricValue} numberOfLines={1}>
                          {item.title}
                        </Text>
                      </View>
                      <View style={styles.metricBox}>
                        <Text style={styles.metricLabel}>Boarding</Text>
                        <Text style={styles.metricValue} numberOfLines={1}>
                          {item.board}
                        </Text>
                      </View>
                      <View style={styles.metricBox}>
                        <Text style={styles.metricLabel}>Est. Fare</Text>
                        <Text style={styles.metricValue}>{item.fareText}</Text>
                      </View>
                    </View>

                    <View style={styles.sectionCard}>
                      <Text style={styles.sectionTitle}>Stop Details</Text>
                      <Text style={styles.instructionText}>
                        Board at: {item.board}
                      </Text>
                      <Text style={styles.instructionText}>
                        Get off at: {item.off}
                      </Text>
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
    flex: 1,
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
    fontSize: 28,
    fontWeight: "700",
    color: GREEN,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#dbe2e8",
    borderWidth: 1,
    borderRadius: 16,
    height: 46,
    paddingHorizontal: 14,
    marginTop: 14,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    color: "#1f2937",
    fontSize: 15,
    paddingRight: 10,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#e2e8f0",
  },
  filterChipActive: {
    backgroundColor: GREEN,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
  },
  filterChipTextActive: {
    color: "#fff",
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 32,
  },
  tripCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    marginBottom: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tripCardHeader: {
    backgroundColor: GREEN,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tripCardHeaderLeft: {
    flex: 1,
  },
  tripDate: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  tripTime: {
    color: "#d8eee5",
    fontSize: 11,
    marginTop: 1,
  },
  deleteBtn: {
    padding: 6,
    opacity: 0.85,
  },
  tripBody: {
    padding: 14,
  },
  statusPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 10,
    backgroundColor: GREEN,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  statusPillSaved: {
    backgroundColor: "#0284C7",
  },
  statusText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  locationText: {
    color: "#1f2937",
    fontSize: 14,
    marginBottom: 4,
    fontWeight: "500",
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
    marginBottom: 10,
  },
  metricBox: {
    flex: 1,
    minWidth: "45%",
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  metricLabel: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "600",
    marginBottom: 2,
    textTransform: "uppercase",
  },
  metricValue: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "700",
  },
  sectionCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 10,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  sectionTitle: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
  },
  instructionText: {
    color: "#475569",
    fontSize: 12,
    marginTop: 2,
  },
  primaryButton: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: GREEN,
    borderRadius: 12,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  emptyState: {
    paddingVertical: 60,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#334155",
    marginTop: 12,
    marginBottom: 6,
  },
  emptyText: {
    color: "#64748b",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  guestLockedContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  guestLockedTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1e293b",
    marginTop: 18,
    marginBottom: 8,
    textAlign: "center",
  },
  guestLockedSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 24,
  },
  guestSignInBtn: {
    backgroundColor: GREEN,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  guestSignInBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
});
