import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import {
  getCommuterReports,
  getFreshmenGuides,
  saveFreshmenGuides,
  type FreshmenGuide,
} from "@/lib/adminAndFeedback";

const GREEN = "#1C5141";

export default function FreshmenGuidesScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [guides, setGuides] = useState<FreshmenGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("Transit Advisory");

  const loadGuides = useCallback(async () => {
    try {
      const allGuides = await getFreshmenGuides();
      setGuides(allGuides);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadGuides();
  }, [loadGuides]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadGuides();
    } finally {
      setRefreshing(false);
    }
  }, [loadGuides]);

  function formatTime(iso: string) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  async function handleDeleteGuide(guide: FreshmenGuide) {
    const executeDelete = async () => {
      try {
        const updated = guides.filter((item) => item.id !== guide.id);
        setGuides(updated);
        await saveFreshmenGuides(updated);
        Alert.alert("Advisory Deleted", `"${guide.title}" has been deleted.`);
      } catch (err: any) {
        Alert.alert("Delete Error", err?.message || "Failed to delete advisory.");
      }
    };

    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm) {
        const confirmed = window.confirm(
          `Are you sure you want to delete this advisory?\n\n"${guide.title}"\n\nThis will remove it from all commuter feeds.`
        );
        if (confirmed) {
          await executeDelete();
        }
        return;
      }
    }

    Alert.alert(
      "Delete Advisory?",
      `Are you sure you want to delete "${guide.title}"? This will permanently remove it from commuter feeds.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: executeDelete },
      ]
    );
  }

  function handleGoBack() {
    if (Platform.OS === "web") {
      if (router.canGoBack()) {
        router.back();
      } else if (typeof window !== "undefined" && window.history && window.history.length > 1) {
        window.history.back();
      } else {
        router.replace("/(main)");
      }
      setTimeout(() => {
        if (typeof window !== "undefined" && window.location.pathname.includes("guides")) {
          router.replace("/(main)");
        }
      }, 150);
      return;
    }

    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(main)");
    }
  }

  const categories = [
    { key: "Transit Advisory", label: "Transit Advisories" },
    { key: "Campus Advisory", label: "Campus Advisories" },
    { key: "Fare Guide", label: "Fare Guides" },
    { key: "broadcasts", label: "Broadcast Alerts" },
  ];

  const filteredGuides =
    selectedCategory === "broadcasts"
      ? guides.filter((g) => g.id.startsWith("broadcast_") || g.isPinned)
      : guides.filter((g) => g.category === selectedCategory);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={handleGoBack}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={GREEN} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Transit Advisories</Text>
          <Text style={styles.headerSub}>Official Admin Advisories & Commuter Updates</Text>
        </View>
      </View>

      {/* Category filter pills */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {categories.map((c) => {
            const isSel = selectedCategory === c.key;
            return (
              <Pressable
                key={c.key}
                onPress={() => setSelectedCategory(c.key)}
                style={[styles.filterChip, isSel && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, isSel && styles.filterChipTextActive]}>
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Guide list */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[GREEN]} />}
      >
        {loading ? (
          <ActivityIndicator size="large" color={GREEN} style={{ marginTop: 40 }} />
        ) : filteredGuides.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="megaphone-outline" size={48} color="#94a3b8" />
            </View>
            <Text style={styles.emptyTitle}>No Advisories Found</Text>
            <Text style={styles.emptyDesc}>
              {`There are currently no active advisories published under "${
                categories.find((c) => c.key === selectedCategory)?.label || selectedCategory
              }".`}
            </Text>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/feedback",
                  params: { tab: "submit", category: "freshmen_inquiry" },
                } as any)
              }
              style={styles.inquiryBtn}
            >
              <Ionicons name="help-circle-outline" size={18} color="#ffffff" />
              <Text style={styles.inquiryBtnText}>Ask a Transit Commute Question</Text>
            </Pressable>
          </View>
        ) : (
          filteredGuides.map((g) => {
            const isBroadcast = g.id.startsWith("broadcast_") || g.isPinned;
            return (
              <View
                key={g.id}
                style={[
                  styles.guideCard,
                  isBroadcast && styles.broadcastGuideCard,
                ]}
              >
                {isBroadcast ? (
                  <View style={styles.broadcastBanner}>
                    <Ionicons name="megaphone" size={13} color="#92400e" />
                    <Text style={styles.broadcastBannerText}>
                      OFFICIAL BROADCAST ALERT · HIGH PRIORITY
                    </Text>
                  </View>
                ) : null}

                <View style={styles.guideHeader}>
                  <View
                    style={[
                      styles.badge,
                      isBroadcast && styles.broadcastBadge,
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        isBroadcast && styles.broadcastBadgeText,
                      ]}
                    >
                      {isBroadcast ? "Priority Broadcast Alert" : g.category}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={styles.guideDate}>{formatTime(g.publishedAt)}</Text>
                    {isAdmin && (
                      <Pressable
                        onPress={() => handleDeleteGuide(g)}
                        style={styles.deleteGuideBtn}
                        accessibilityLabel={`Delete advisory ${g.title}`}
                      >
                        <Ionicons name="trash-outline" size={13} color="#ef4444" />
                        <Text style={styles.deleteGuideBtnText}>Delete</Text>
                      </Pressable>
                    )}
                  </View>
                </View>

                <Text style={styles.guideTitle}>{g.title}</Text>
                <Text style={styles.guideAuthor}>Posted by: {g.author}</Text>
                <Text style={styles.guideContent}>{g.content}</Text>
              </View>
            );
          })
        )}

        {/* Quick report banner at bottom */}
        {!loading && (
          <View style={styles.reportBanner}>
            <View style={styles.reportBannerText}>
              <Text style={styles.reportBannerTitle}>Have a Route or Commute Question?</Text>
              <Text style={styles.reportBannerSub}>
                Submit an inquiry or report a traffic blockage directly to the transit administration desk.
              </Text>
            </View>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/feedback",
                  params: { tab: "submit", category: "freshmen_inquiry" },
                } as any)
              }
              style={styles.reportBannerBtn}
            >
              <Text style={styles.reportBannerBtnText}>Submit Inquiry</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
    borderRadius: 8,
    cursor: "pointer" as any,
  },
  headerTitleWrap: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#0f172a" },
  headerSub: { fontSize: 12, color: "#64748b", marginTop: 2 },
  filterBar: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 8,
  },
  filterScroll: { paddingHorizontal: 16, gap: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  filterChipActive: {
    backgroundColor: "#dcfce7",
    borderColor: GREEN,
  },
  filterChipText: { fontSize: 12, fontWeight: "600", color: "#64748b" },
  filterChipTextActive: { color: GREEN, fontWeight: "700" },
  scrollContent: { padding: 16, paddingBottom: 40 },
  guideCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  broadcastGuideCard: {
    borderColor: "#fde68a",
    backgroundColor: "#fffef9",
  },
  broadcastBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fef3c7",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  broadcastBannerText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#92400e",
    letterSpacing: 0.5,
  },
  broadcastBadge: {
    backgroundColor: "#fef3c7",
    borderColor: "#fde68a",
  },
  broadcastBadgeText: {
    color: "#b45309",
  },
  guideHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  badge: {
    backgroundColor: "#eff6ff",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  badgeText: { fontSize: 11, fontWeight: "700", color: "#1d4ed8" },
  guideDate: { fontSize: 11, color: "#94a3b8" },
  deleteGuideBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  deleteGuideBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#dc2626",
  },
  guideTitle: { fontSize: 16, fontWeight: "700", color: "#0f172a", marginBottom: 2 },
  guideAuthor: { fontSize: 12, color: "#64748b", fontStyle: "italic", marginBottom: 8 },
  guideContent: { fontSize: 13, color: "#334155", lineHeight: 20 },
  pointsBox: {
    marginTop: 12,
    backgroundColor: "#f8fafc",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  pointsHeader: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 },
  pointsTitle: { fontSize: 12, fontWeight: "700", color: "#334155" },
  pointsList: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pointChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ffffff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  pointChipText: { fontSize: 11, color: "#1e293b", fontWeight: "500" },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 50,
    paddingHorizontal: 24,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: "#0f172a", marginBottom: 6 },
  emptyDesc: { fontSize: 13, color: "#64748b", textAlign: "center", lineHeight: 19, marginBottom: 20 },
  inquiryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: GREEN,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  inquiryBtnText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  reportBanner: {
    marginTop: 10,
    backgroundColor: "#f0fdf4",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    flexDirection: "column",
    gap: 12,
  },
  reportBannerText: { flex: 1 },
  reportBannerTitle: { fontSize: 14, fontWeight: "700", color: GREEN },
  reportBannerSub: { fontSize: 12, color: "#166534", marginTop: 2, lineHeight: 17 },
  reportBannerBtn: {
    alignSelf: "flex-start",
    backgroundColor: GREEN,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  reportBannerBtnText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
});
