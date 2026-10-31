import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import {
  addCommuterReport,
  getCommuterReports,
  getFreshmenGuides,
  REPORT_CATEGORY_LABELS,
  REPORT_STATUS_DETAILS,
  type CommuterReport,
  type CommuterReportCategory,
  type FreshmenGuide,
} from "@/lib/adminAndFeedback";

const GREEN = "#1C5141";

export default function FeedbackAndReportsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string; category?: string }>();
  const { session, userRole } = useAuth();

  const [activeTab, setActiveTab] = useState<"submit" | "tracking" | "advisories">(
    params.tab === "tracking"
      ? "tracking"
      : params.tab === "advisories"
      ? "advisories"
      : "submit"
  );

  const initialCat: CommuterReportCategory =
    params.category && params.category in REPORT_CATEGORY_LABELS
      ? (params.category as CommuterReportCategory)
      : "road_update";

  const [category, setCategory] = useState<CommuterReportCategory>(initialCat);
  const [routeOrArea, setRouteOrArea] = useState("");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<"normal" | "high" | "critical">("normal");
  const [submitting, setSubmitting] = useState(false);

  const [reports, setReports] = useState<CommuterReport[]>([]);
  const [guides, setGuides] = useState<FreshmenGuide[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [allReports, allGuides] = await Promise.all([
        getCommuterReports(),
        getFreshmenGuides(),
      ]);

      setReports(allReports);
      setGuides(allGuides);
    } catch {}
    setLoadingHistory(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Sync tab and category if params change
  useEffect(() => {
    if (params.tab === "tracking") setActiveTab("tracking");
    else if (params.tab === "advisories") setActiveTab("advisories");
    else if (params.tab === "submit") setActiveTab("submit");

    if (params.category && params.category in REPORT_CATEGORY_LABELS) {
      setCategory(params.category as CommuterReportCategory);
    }
  }, [params.tab, params.category]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  async function handleSubmit() {
    if (!routeOrArea.trim()) {
      Alert.alert("Missing Route or Area", "Please specify which route, road, or campus gate is affected.");
      return;
    }
    if (!description.trim()) {
      Alert.alert("Missing Details", "Please provide a brief description of the report or concern.");
      return;
    }

    setSubmitting(true);
    try {
      const userName =
        session?.user?.user_metadata?.full_name ||
        session?.user?.email ||
        "Student Commuter";

      const newReport = await addCommuterReport({
        userId: session?.user?.id || "guest_user",
        userName,
        userRole,
        category,
        routeOrArea: routeOrArea.trim(),
        description: description.trim(),
        urgency,
      });

      setRouteOrArea("");
      setDescription("");
      setUrgency("normal");
      await loadData();

      Alert.alert(
        "Report Submitted to Admin Desk",
        `Your report #${newReport.id} has been submitted to the University Transit Admin Desk. The administrator can now review, verify, and broadcast this notice.`
      );
      setActiveTab("tracking");
    } catch (e: any) {
      Alert.alert("Submission Error", e?.message || "Could not submit report.");
    } finally {
      setSubmitting(false);
    }
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
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
        if (typeof window !== "undefined" && window.location.pathname.includes("feedback")) {
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

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header with Back button */}
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
          <Text style={styles.headerTitle}>Commuter Reports & Feedback</Text>
          <Text style={styles.headerSub}>TARA Student Transit & Administration Desk</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <Pressable
          onPress={() => setActiveTab("submit")}
          style={[styles.tabItem, activeTab === "submit" && styles.tabItemActive]}
        >
          <Ionicons
            name="create-outline"
            size={18}
            color={activeTab === "submit" ? GREEN : "#64748b"}
          />
          <Text style={[styles.tabText, activeTab === "submit" && styles.tabTextActive]}>
            Report Issue
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab("tracking")}
          style={[styles.tabItem, activeTab === "tracking" && styles.tabItemActive]}
        >
          <Ionicons
            name="time-outline"
            size={18}
            color={activeTab === "tracking" ? GREEN : "#64748b"}
          />
          <Text style={[styles.tabText, activeTab === "tracking" && styles.tabTextActive]}>
            Status Tracking
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab("advisories")}
          style={[styles.tabItem, activeTab === "advisories" && styles.tabItemActive]}
        >
          <Ionicons
            name="megaphone-outline"
            size={18}
            color={activeTab === "advisories" ? GREEN : "#64748b"}
          />
          <Text style={[styles.tabText, activeTab === "advisories" && styles.tabTextActive]}>
            Transit Advisories
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[GREEN]} />
          }
        >
          {activeTab === "submit" ? (
            <View style={styles.formCard}>
              <Text style={styles.sectionHeading}>Report Transit Issue or Commuter Feedback</Text>
              <Text style={styles.sectionSubtitle}>
                Submissions are sent directly to the Admin Panel for review, verification, and route broadcasts.
              </Text>

              <Text style={styles.fieldSectionLabel}>Select Report Category:</Text>
              <View style={styles.categoryGrid}>
                {(Object.keys(REPORT_CATEGORY_LABELS) as CommuterReportCategory[]).map((catKey) => {
                  const cat = REPORT_CATEGORY_LABELS[catKey];
                  const isSelected = category === catKey;
                  return (
                    <Pressable
                      key={catKey}
                      onPress={() => setCategory(catKey)}
                      style={[styles.catOption, isSelected && styles.catOptionSelected]}
                    >
                      <View style={[styles.catIconWrap, isSelected && styles.catIconWrapSelected]}>
                        <Ionicons
                          name={cat.icon as any}
                          size={20}
                          color={isSelected ? "#ffffff" : GREEN}
                        />
                      </View>
                      <View style={styles.catContent}>
                        <Text style={[styles.catTitle, isSelected && styles.catTitleSelected]}>
                          {cat.label}
                        </Text>
                        <Text style={styles.catDesc}>{cat.desc}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.inputLabel}>Route, Road, or Campus Landmark *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Monumento Jeep Line, Tullahan Rd, DLSAU Gate 1"
                placeholderTextColor="#94a3b8"
                value={routeOrArea}
                onChangeText={setRouteOrArea}
              />

              <Text style={styles.inputLabel}>Details & Incident Notes *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Describe the issue (e.g. road obstruction, temporary rerouting, fare concern, or transit inquiry)..."
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={4}
                value={description}
                onChangeText={setDescription}
              />

              <Text style={styles.inputLabel}>Urgency / Impact Level</Text>
              <View style={styles.urgencyRow}>
                {(
                  [
                    { key: "normal", label: "Normal", color: "#059669" },
                    { key: "high", label: "High (Delays)", color: "#D97706" },
                    { key: "critical", label: "Critical (Blocked)", color: "#DC2626" },
                  ] as const
                ).map((lvl) => (
                  <Pressable
                    key={lvl.key}
                    onPress={() => setUrgency(lvl.key)}
                    style={[
                      styles.urgencyBtn,
                      urgency === lvl.key && {
                        borderColor: lvl.color,
                        backgroundColor: `${lvl.color}15`,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.urgencyText,
                        urgency === lvl.key && { color: lvl.color, fontWeight: "700" },
                      ]}
                    >
                      {lvl.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                onPress={handleSubmit}
                disabled={submitting}
                style={[styles.submitBtn, submitting && styles.btnDisabled]}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="paper-plane" size={18} color="#fff" />
                    <Text style={styles.submitBtnText}>Post Issue to Admin Panel</Text>
                  </>
                )}
              </Pressable>
            </View>
          ) : activeTab === "tracking" ? (
            <View style={styles.trackingContainer}>
              <Text style={styles.sectionHeading}>Submitted Reports & Status Tracking</Text>
              <Text style={styles.sectionSubtitle}>
                Live tracking of university administrator review, verifications, and official responses.
              </Text>

              {loadingHistory ? (
                <ActivityIndicator color={GREEN} style={{ marginTop: 24 }} />
              ) : reports.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Ionicons name="document-text-outline" size={48} color="#94a3b8" />
                  <Text style={styles.emptyTitle}>No Reports Submitted Yet</Text>
                  <Text style={styles.emptyDesc}>
                    When you report a road obstruction, reroute, or feedback, its live verification status and admin reply will appear here.
                  </Text>
                  <Pressable onPress={() => setActiveTab("submit")} style={styles.emptyBtn}>
                    <Text style={styles.emptyBtnText}>Report an Issue Now</Text>
                  </Pressable>
                </View>
              ) : (
                reports.map((item) => {
                  const status = REPORT_STATUS_DETAILS[item.status] || {
                    label: item.status,
                    color: "#475569",
                    bg: "#f1f5f9",
                  };
                  const catLabel = REPORT_CATEGORY_LABELS[item.category]?.label || item.category;

                  return (
                    <View key={item.id} style={styles.reportCard}>
                      <View style={styles.reportHeader}>
                        <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
                          <Text style={[styles.statusPillText, { color: status.color }]}>
                            {status.label}
                          </Text>
                        </View>
                        <Text style={styles.reportTime}>{formatTime(item.submittedAt)}</Text>
                      </View>

                      <Text style={styles.reportCategory}>{catLabel}</Text>
                      <Text style={styles.reportRoute}>
                        <Ionicons name="location-sharp" size={14} color={GREEN} /> {item.routeOrArea}
                      </Text>
                      <Text style={styles.reportDesc}>{item.description}</Text>

                      {item.adminResponse ? (
                        <View style={styles.adminReplyBox}>
                          <View style={styles.adminReplyHeader}>
                            <Ionicons name="shield-checkmark" size={16} color={GREEN} />
                            <Text style={styles.adminReplyTitle}>University Transit Desk Response:</Text>
                          </View>
                          <Text style={styles.adminReplyText}>{item.adminResponse}</Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })
              )}
            </View>
          ) : (
            <View style={styles.trackingContainer}>
              <View style={styles.guidesHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionHeading}>Transit Advisories & Broadcasts</Text>
                  <Text style={styles.sectionSubtitle}>
                    Official advisories and alerts posted by university administrators for all commuters.
                  </Text>
                </View>
                <Pressable
                  onPress={() => router.push("/guides" as any)}
                  style={styles.openDedicatedGuidesBtn}
                >
                  <Text style={styles.openDedicatedGuidesBtnText}>Full View</Text>
                  <Ionicons name="arrow-forward" size={14} color="#ffffff" />
                </Pressable>
              </View>

              {guides.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Ionicons name="megaphone-outline" size={48} color="#94a3b8" />
                  <Text style={styles.emptyTitle}>No Advisories Posted Yet</Text>
                  <Text style={styles.emptyDesc}>
                    University administrators have not published transit advisories yet. You can submit an inquiry or issue under the "Report Issue" tab.
                  </Text>
                </View>
              ) : (
                guides.map((g) => {
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
                          styles.guideBadge,
                          g.id.startsWith("broadcast_") && styles.broadcastBadge,
                        ]}
                      >
                        <Text
                          style={[
                            styles.guideBadgeText,
                            g.id.startsWith("broadcast_") && styles.broadcastBadgeText,
                          ]}
                        >
                          {g.id.startsWith("broadcast_") ? "Live Advisory" : g.category}
                        </Text>
                      </View>
                      <Text style={styles.guideDate}>{formatTime(g.publishedAt)}</Text>
                    </View>
                    <Text style={styles.guideTitle}>{g.title}</Text>
                    <Text style={styles.guideAuthor}>Posted by: {g.author}</Text>
                    <Text style={styles.guideContent}>{g.content}</Text>
                  </View>
                );
              })
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  flex: { flex: 1 },
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
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabItemActive: { borderBottomColor: GREEN },
  tabText: { fontSize: 13, fontWeight: "600", color: "#64748b" },
  tabTextActive: { color: GREEN },
  scrollContent: { padding: 16, paddingBottom: 40 },
  formCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  sectionHeading: { fontSize: 17, fontWeight: "700", color: "#0f172a" },
  sectionSubtitle: { fontSize: 13, color: "#64748b", marginTop: 4, marginBottom: 16 },
  fieldSectionLabel: { fontSize: 13, fontWeight: "700", color: "#334155", marginBottom: 8 },
  categoryGrid: { gap: 10, marginBottom: 18 },
  catOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
  },
  catOptionSelected: {
    borderColor: GREEN,
    backgroundColor: "#f0fdf4",
  },
  catIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  catIconWrapSelected: {
    backgroundColor: GREEN,
  },
  catContent: { flex: 1 },
  catTitle: { fontSize: 13, fontWeight: "700", color: "#0f172a" },
  catTitleSelected: { color: GREEN },
  catDesc: { fontSize: 11, color: "#64748b", marginTop: 2, lineHeight: 15 },
  inputLabel: { fontSize: 12, fontWeight: "700", color: "#334155", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0f172a",
    backgroundColor: "#f8fafc",
    marginBottom: 14,
  },
  textArea: {
    height: 90,
    textAlignVertical: "top",
  },
  urgencyRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  urgencyBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    alignItems: "center",
  },
  urgencyText: { fontSize: 12, fontWeight: "600", color: "#64748b" },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: GREEN,
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnDisabled: { opacity: 0.6 },
  submitBtnText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  trackingContainer: { gap: 12 },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#0f172a", marginTop: 10 },
  emptyDesc: { fontSize: 13, color: "#64748b", textAlign: "center", marginTop: 4, lineHeight: 18 },
  emptyBtn: {
    marginTop: 16,
    backgroundColor: GREEN,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  emptyBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  reportCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  reportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusPillText: { fontSize: 11, fontWeight: "700" },
  reportTime: { fontSize: 11, color: "#94a3b8" },
  reportCategory: { fontSize: 12, fontWeight: "700", color: "#334155" },
  reportRoute: { fontSize: 13, fontWeight: "700", color: GREEN, marginTop: 4 },
  reportDesc: { fontSize: 13, color: "#475569", marginTop: 4, lineHeight: 18 },
  adminReplyBox: {
    marginTop: 10,
    backgroundColor: "#f0fdf4",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  adminReplyHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  adminReplyTitle: { fontSize: 11, fontWeight: "700", color: GREEN },
  adminReplyText: { fontSize: 12, color: "#166534", lineHeight: 17 },
  guidesHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  openDedicatedGuidesBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: GREEN,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  openDedicatedGuidesBtnText: { color: "#ffffff", fontSize: 11, fontWeight: "700" },
  guideCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
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
    marginBottom: 8,
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
    marginBottom: 6,
  },
  guideBadge: {
    backgroundColor: "#eff6ff",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  guideBadgeText: { fontSize: 11, fontWeight: "700", color: "#1d4ed8" },
  guideDate: { fontSize: 11, color: "#94a3b8" },
  guideTitle: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  guideAuthor: { fontSize: 11, color: "#64748b", fontStyle: "italic", marginTop: 2, marginBottom: 6 },
  guideContent: { fontSize: 13, color: "#334155", lineHeight: 18 },
  pointsWrap: { marginTop: 8, backgroundColor: "#f8fafc", padding: 8, borderRadius: 6 },
  pointsLabel: { fontSize: 11, fontWeight: "700", color: "#475569" },
  pointsList: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  pointChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ffffff",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  pointChipText: { fontSize: 10, color: "#1e293b" },
});
