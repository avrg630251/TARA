import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { TransitVehicleIcon } from "@/components/TransitVehicleIcon";
import {
  appendAuditLog,
  getAuditLogs,
  getCommuterReports,
  getFreshmenGuides,
  getManagedRoutes,
  getManagedUsers,
  REPORT_STATUS_DETAILS,
  ROLE_BADGE_COLORS,
  ROLE_LABELS,
  saveCommuterReports,
  saveFreshmenGuides,
  saveManagedRoutes,
  saveManagedUsers,
  type AuditLogEntry,
  type CommuterReport,
  type FreshmenGuide,
  type ManagedRoute,
  type ManagedUserAccount,
  type RouteAvailabilityStatus,
  type UserRole,
} from "@/lib/adminAndFeedback";
import { getRouteSafetySummary, subscribeToSafetyChanges } from "@/lib/routeSafety";

const GREEN = "#1C5141";

type AdminTab = "users" | "routes" | "guides" | "feedback" | "logs";

export default function AdminScreen() {
  const router = useRouter();
  const { session, userRole, isAdmin, setUserRole } = useAuth();

  const [activeTab, setActiveTab] = useState<AdminTab>("users");
  const [loading, setLoading] = useState(true);

  // Data states
  const [users, setUsers] = useState<ManagedUserAccount[]>([]);
  const [routes, setRoutes] = useState<ManagedRoute[]>([]);
  const [guides, setGuides] = useState<FreshmenGuide[]>([]);
  const [reports, setReports] = useState<CommuterReport[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);

  // Modals & form states
  const [selectedUser, setSelectedUser] = useState<ManagedUserAccount | null>(null);
  const [roleModalVisible, setRoleModalVisible] = useState(false);

  const [statusModalRoute, setStatusModalRoute] = useState<ManagedRoute | null>(null);
  const [routeStatusChoice, setRouteStatusChoice] = useState<RouteAvailabilityStatus>("active");
  const [routeNotice, setRouteNotice] = useState("");
  const [routeFareInput, setRouteFareInput] = useState("");
  const [routeSoloFareInput, setRouteSoloFareInput] = useState("");

  // Add New Route Modal states
  const [newRouteModalVisible, setNewRouteModalVisible] = useState(false);
  const [newRouteName, setNewRouteName] = useState("");
  const [newRouteOrigin, setNewRouteOrigin] = useState("");
  const [newRouteDestination, setNewRouteDestination] = useState("DLSAU Main Gate, Malabon");
  const [newRouteVehicle, setNewRouteVehicle] = useState<"jeepney" | "tricycle" | "bus">("jeepney");
  const [newRouteFare, setNewRouteFare] = useState("14");
  const [newRouteSoloFare, setNewRouteSoloFare] = useState("50");
  const [newRouteLandmarks, setNewRouteLandmarks] = useState("");
  const [newRouteSignboard, setNewRouteSignboard] = useState("");
  const [newRouteWhatToSay, setNewRouteWhatToSay] = useState("");

  const [newGuideModalVisible, setNewGuideModalVisible] = useState(false);
  const [guideTitle, setGuideTitle] = useState("");
  const [guideCategory, setGuideCategory] = useState<FreshmenGuide["category"]>("Transit Advisory");
  const [guideIsBroadcast, setGuideIsBroadcast] = useState(false);
  const [guideContent, setGuideContent] = useState("");
  const [guideDropoffs, setGuideDropoffs] = useState("");

  const [triageReport, setTriageReport] = useState<CommuterReport | null>(null);
  const [triageResponse, setTriageResponse] = useState("");
  const [triageStatus, setTriageStatus] = useState<CommuterReport["status"]>("verified");

  const [userFilter, setUserFilter] = useState<string>("all");
  const [, setSafetyTick] = useState(0);

  // Subscribe to route safety changes so Admin routes update live when users score a route
  useEffect(() => {
    const unsub = subscribeToSafetyChanges(() => {
      setSafetyTick((c) => c + 1);
    });
    return unsub;
  }, []);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [r, g, rep, l] = await Promise.all([
        getManagedRoutes(),
        getFreshmenGuides(),
        getCommuterReports(),
        getAuditLogs(),
      ]);

      // Set immediately so reports, logs, routes, and guides render without waiting
      setRoutes(r);
      setGuides(g);
      setReports(rep);
      setLogs(l);

      // Pull real signed-up users directly from Supabase (combine RPC + profiles + local cache)
      let pulledUsers: ManagedUserAccount[] = [];
      const addOrMergeUser = (candidate: ManagedUserAccount) => {
        if (!candidate.id && !candidate.email) return;
        const normEmail = candidate.email?.trim().toLowerCase();
        const existingIdx = pulledUsers.findIndex(
          (u) =>
            (candidate.id && u.id === candidate.id) ||
            (normEmail && u.email?.trim().toLowerCase() === normEmail)
        );
        if (existingIdx === -1) {
          pulledUsers.push(candidate);
        } else {
          const prev = pulledUsers[existingIdx];
          pulledUsers[existingIdx] = {
            ...prev,
            email:
              prev.email && !prev.email.startsWith("user@")
                ? prev.email
                : candidate.email || prev.email,
            fullName:
              prev.fullName &&
              prev.fullName !== "Registered User" &&
              prev.fullName !== "Registered Commuter"
                ? prev.fullName
                : candidate.fullName || prev.fullName,
            role: prev.role === "admin" ? "admin" : candidate.role || prev.role,
          };
        }
      };

      try {
        // 1. Try RPC function which queries auth.users directly
        const { data: rpcData, error: rpcError } = await supabase.rpc("get_all_registered_users");
        if (!rpcError && rpcData && Array.isArray(rpcData) && rpcData.length > 0) {
          for (const u of rpcData as any[]) {
            addOrMergeUser({
              id: u.id,
              email:
                u.email ||
                (u.id === session?.user?.id
                  ? session?.user?.email || "user@dlsau.edu.ph"
                  : "user@dlsau.edu.ph"),
              fullName:
                u.full_name ||
                (u.id === session?.user?.id
                  ? session?.user?.user_metadata?.full_name ||
                    session?.user?.email?.split("@")[0] ||
                    "Registered User"
                  : u.email?.split("@")[0] || "Registered User"),
              role: (u.role as UserRole) || "user",
              schoolName: u.school_name || "De La Salle Araneta University",
              departmentOrProgram:
                u.department_or_program &&
                u.department_or_program !== "Registered Student"
                  ? u.department_or_program
                  : u.role === "admin"
                    ? "University Administration"
                    : undefined,
              status: "active",
              joinedAt: u.created_at || new Date().toISOString(),
            });
          }
        }

        // 2. Also query public.profiles directly and merge any additional users
        const res = await supabase
          .from("profiles")
          .select("id, email, role, full_name, school_name, department_or_program, created_at")
          .order("created_at", { ascending: false });

        let dbProfiles: any[] | null = null;
        if (!res.error && res.data) {
          dbProfiles = res.data;
        } else {
          const fallbackRes = await supabase
            .from("profiles")
            .select("id, role, full_name, school_name, department_or_program, created_at")
            .order("created_at", { ascending: false });
          if (fallbackRes.data) dbProfiles = fallbackRes.data;
        }

        if (dbProfiles && dbProfiles.length > 0) {
          for (const p of dbProfiles) {
            const isCurrentUser = p.id === session?.user?.id;
            const email =
              p.email ||
              (isCurrentUser
                ? session?.user?.email || "admin@dlsau.edu.ph"
                : `${(p.full_name || "user")
                    .toLowerCase()
                    .replace(/[^a-z0-9]/g, ".")}@dlsau.edu.ph`);
            const fullName =
              p.full_name ||
              (isCurrentUser
                ? session?.user?.user_metadata?.full_name ||
                  session?.user?.email?.split("@")[0] ||
                  "Administrator"
                : email.split("@")[0] || "Registered Commuter");
            addOrMergeUser({
              id: p.id,
              email,
              fullName,
              role: (p.role as UserRole) || "user",
              schoolName: p.school_name || "De La Salle Araneta University",
              departmentOrProgram:
                p.department_or_program &&
                p.department_or_program !== "Registered Student"
                  ? p.department_or_program
                  : p.role === "admin"
                    ? "University Administration"
                    : undefined,
              status: "active",
              joinedAt: p.created_at || new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        console.warn("User load error:", err);
      }

      // 3. Incorporate locally recorded registered users
      const localUsers = await getManagedUsers();
      for (const loc of localUsers) {
        addOrMergeUser(loc);
      }

      // 4. Also discover any registered user accounts who submitted commuter reports
      for (const reportItem of rep) {
        if (
          reportItem.userId &&
          reportItem.userId !== "guest_user" &&
          reportItem.userRole !== "guest"
        ) {
          const isEmail = reportItem.userName?.includes("@");
          addOrMergeUser({
            id: reportItem.userId,
            email: isEmail
              ? reportItem.userName
              : `${(reportItem.userName || "commuter")
                  .toLowerCase()
                  .replace(/[^a-z0-9]/g, ".")}@dlsau.edu.ph`,
            fullName: reportItem.userName || "Registered Commuter",
            role: reportItem.userRole || "user",
            schoolName: "De La Salle Araneta University",
            status: "active",
            joinedAt: reportItem.submittedAt || new Date().toISOString(),
          });
        }
      }

      // Ensure active session user is included with their active role
      if (session?.user) {
        const foundIdx = pulledUsers.findIndex((item) => item.id === session.user.id);
        if (foundIdx === -1) {
          pulledUsers.unshift({
            id: session.user.id,
            email: session.user.email || "current.user@dlsau.edu.ph",
            fullName:
              session.user.user_metadata?.full_name ||
              session.user.user_metadata?.name ||
              session.user.email?.split("@")[0] ||
              "Current User",
            role: userRole,
            schoolName:
              session.user.user_metadata?.school_name ||
              "De La Salle Araneta University",
            departmentOrProgram: "Active Administrator Session",
            status: "active",
            joinedAt: session.user.created_at || new Date().toISOString(),
          });
        } else {
          pulledUsers[foundIdx] = {
            ...pulledUsers[foundIdx],
            role: userRole,
          };
        }
      }

      setUsers(pulledUsers);
      await saveManagedUsers(pulledUsers);
      setRoutes(r);
      setGuides(g);
      setReports(rep);
      setLogs(l);
    } catch {}
    setLoading(false);
  }, [session?.user, userRole]);

  const [refreshing, setRefreshing] = useState(false);

  // Automatically refresh user accounts whenever the administrator opens or returns to this screen
  useFocusEffect(
    useCallback(() => {
      void loadAllData();
    }, [loadAllData])
  );

  // Supabase Real-Time Listener: Automatically re-pulls registered users, commuter reports, and audit logs
  useEffect(() => {
    const channel = supabase
      .channel("admin:realtime_sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => {
          void loadAllData();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "commuter_reports" },
        async () => {
          const freshReports = await getCommuterReports();
          setReports(freshReports);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "audit_logs" },
        async () => {
          const freshLogs = await getAuditLogs();
          setLogs(freshLogs);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadAllData]);

  // 1. Role Change Handler
  async function handleAssignRole(targetUser: ManagedUserAccount, newRole: UserRole) {
    const updated = users.map((u) => (u.id === targetUser.id ? { ...u, role: newRole } : u));
    setUsers(updated);
    await saveManagedUsers(updated);

    // Save target user role locally
    await AsyncStorage.setItem(`tara:user:role:${targetUser.id}`, newRole).catch(() => {});

    // If target user is the currently logged in user, update active auth context state
    if (targetUser.id === session?.user?.id) {
      await setUserRole(newRole);
    }

    // Persist to Supabase profiles table
    try {
      await supabase
        .from("profiles")
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq("id", targetUser.id);
    } catch {}

    await appendAuditLog({
      actor: session?.user?.email || "University Admin",
      action: "USER_ROLE_UPDATED",
      target: `${targetUser.fullName} (${targetUser.email})`,
      details: `Changed role from ${ROLE_LABELS[targetUser.role]} to ${ROLE_LABELS[newRole]}`,
      isVerified: true,
    });

    const refreshedLogs = await getAuditLogs();
    setLogs(refreshedLogs);

    setRoleModalVisible(false);
    setSelectedUser(null);
    Alert.alert(
      "Role Updated",
      `${targetUser.fullName}'s role has been changed to "${ROLE_LABELS[newRole]}". Only administrators can perform this action.`
    );
  }

  // 2. Route Status, Fare & Verification Handler
  async function handleSaveRouteStatus() {
    if (!statusModalRoute) return;

    const parsedFare = parseFloat(routeFareInput.replace(/[^0-9.]/g, ""));
    const parsedSolo = parseFloat(routeSoloFareInput.replace(/[^0-9.]/g, ""));

    const hasTricycle =
      statusModalRoute.hasTricycle || statusModalRoute.vehicleType === "tricycle";

    const nextFare =
      Number.isFinite(parsedFare) && parsedFare > 0
        ? Math.ceil(parsedFare)
        : statusModalRoute.customFare ?? 14;

    const nextSoloFare =
      hasTricycle && Number.isFinite(parsedSolo) && parsedSolo > 0
        ? Math.ceil(parsedSolo)
        : statusModalRoute.customSoloFare ?? (hasTricycle ? 50 : null);

    const nextFareText = hasTricycle
      ? `₱${nextFare} shared · ₱${nextSoloFare ?? 50} solo`
      : `Php ${nextFare.toFixed(2)}`;

    const updated = routes.map((r) =>
      r.routeId === statusModalRoute.routeId
        ? {
            ...r,
            fareText: nextFareText,
            customFare: nextFare,
            customSoloFare: nextSoloFare,
            status: routeStatusChoice,
            statusNotice: routeNotice.trim() || undefined,
            lastUpdated: new Date().toISOString(),
            verifiedBy: `${session?.user?.email || "Admin"} (Verified)`,
          }
        : r
    );

    setRoutes(updated);
    await saveManagedRoutes(updated);

    await appendAuditLog({
      actor: session?.user?.email || "University Admin",
      action: "ROUTE_FARE_AND_STATUS_UPDATE",
      target: statusModalRoute.routeName,
      details: `Fare set to ${nextFareText}. Status set to ${routeStatusChoice.toUpperCase()}. Note: ${routeNotice.trim() || "Normal schedule"}`,
      isVerified: true,
    });

    const refreshedLogs = await getAuditLogs();
    setLogs(refreshedLogs);

    setStatusModalRoute(null);
    Alert.alert(
      "Route & Fare Updated",
      `"${statusModalRoute.routeName}" has been updated with fare ${nextFareText} and status "${routeStatusChoice.toUpperCase()}".`
    );
  }

  // 2b. Create New Admin Route Handler
  async function handleCreateRoute() {
    const trimmedName = newRouteName.trim();
    const trimmedOrigin = newRouteOrigin.trim();
    const trimmedDest = newRouteDestination.trim() || "DLSAU Main Gate, Malabon";

    if (!trimmedName || !trimmedOrigin) {
      Alert.alert(
        "Missing Route Details",
        "Please enter both the Route Name and Origin Terminal / Boarding Point."
      );
      return;
    }

    const parsedFare = parseFloat(newRouteFare.replace(/[^0-9.]/g, ""));
    const parsedSolo = parseFloat(newRouteSoloFare.replace(/[^0-9.]/g, ""));
    const isTrike = newRouteVehicle === "tricycle";
    const baseFare =
      Number.isFinite(parsedFare) && parsedFare > 0
        ? Math.ceil(parsedFare)
        : isTrike
          ? 15
          : newRouteVehicle === "bus"
            ? 35
            : 14;
    const soloFare =
      isTrike && Number.isFinite(parsedSolo) && parsedSolo > 0
        ? Math.ceil(parsedSolo)
        : isTrike
          ? 50
          : null;

    const fareText = isTrike
      ? `₱${baseFare} shared · ₱${soloFare} solo`
      : `Php ${baseFare.toFixed(2)}`;

    const landmarks = newRouteLandmarks
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const createdRoute: ManagedRoute = {
      routeId: `itin_admin_${Date.now().toString(36)}`,
      routeName: trimmedName,
      origin: trimmedOrigin,
      destination: trimmedDest,
      vehicleType: newRouteVehicle,
      landmarks: landmarks.length > 0 ? landmarks : [trimmedOrigin, trimmedDest],
      fareText,
      customFare: baseFare,
      customSoloFare: soloFare,
      hasTricycle: isTrike,
      isCustomAdminRoute: true,
      signboard: newRouteSignboard.trim() || undefined,
      whatToSay: newRouteWhatToSay.trim() || "Para po sa DLSAU",
      status: "active",
      lastUpdated: new Date().toISOString(),
      verifiedBy: `${session?.user?.email || "Admin"} (Verified)`,
    };

    const updated = [createdRoute, ...routes];
    setRoutes(updated);
    await saveManagedRoutes(updated);

    await appendAuditLog({
      actor: session?.user?.email || "University Admin",
      action: "ROUTE_CREATED",
      target: createdRoute.routeName,
      details: `Added ${newRouteVehicle.toUpperCase()} route from ${trimmedOrigin} to ${trimmedDest} (Fare: ${fareText})`,
      isVerified: true,
    });

    const refreshedLogs = await getAuditLogs();
    setLogs(refreshedLogs);

    setNewRouteName("");
    setNewRouteOrigin("");
    setNewRouteDestination("DLSAU Main Gate, Malabon");
    setNewRouteFare("14");
    setNewRouteSoloFare("50");
    setNewRouteLandmarks("");
    setNewRouteSignboard("");
    setNewRouteWhatToSay("");
    setNewRouteModalVisible(false);

    Alert.alert(
      "New Route Added",
      `"${createdRoute.routeName}" has been added and is now live in route search.`
    );
  }

  // 3. Transit Advisory Posting Handler
  async function handleCreateGuide() {
    const trimmedTitle = guideTitle.trim();
    const trimmedContent = guideContent.trim();

    if (!trimmedTitle || !trimmedContent) {
      Alert.alert("Incomplete Advisory", "Please enter both a title and advisory instructions.");
      return;
    }

    // Duplicate Title Validation
    const isDuplicateTitle = guides.some(
      (g) => g.title.trim().toLowerCase() === trimmedTitle.toLowerCase()
    );
    if (isDuplicateTitle) {
      Alert.alert(
        "Duplicate Advisory Title",
        "An advisory with this title already exists. Please choose a distinctive title or delete the old advisory first."
      );
      return;
    }

    // Duplicate Content Validation
    const isDuplicateContent = guides.some(
      (g) =>
        g.category === guideCategory &&
        g.content.trim().toLowerCase() === trimmedContent.toLowerCase()
    );
    if (isDuplicateContent) {
      Alert.alert(
        "Duplicate Advisory Content",
        `An advisory with identical guidance text already exists under "${guideCategory}".`
      );
      return;
    }

    const points = guideDropoffs
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const newGuide: FreshmenGuide = {
      id: guideIsBroadcast
        ? `broadcast_manual_${Date.now().toString(36)}`
        : `gd_${Date.now().toString(36)}`,
      title: trimmedTitle,
      category: guideCategory,
      targetAudience: "all",
      content: trimmedContent,
      recommendedOrigins: ["Monumento LRT-1", "North EDSA Carousel"],
      pickupOrDropoffPoints: points.length ? points : ["DLSAU Gate 1", "DLSAU Gate 2"],
      publishedAt: new Date().toISOString(),
      author: session?.user?.user_metadata?.full_name || "DLSAU Transit Desk",
      isPinned: guideIsBroadcast,
    };

    const updated = [newGuide, ...guides];
    setGuides(updated);
    await saveFreshmenGuides(updated);

    await appendAuditLog({
      actor: session?.user?.email || "University Admin",
      action: "TRANSIT_ADVISORY_POSTED",
      target: newGuide.title,
      details: `Published official guidance under category ${newGuide.category}${
        guideIsBroadcast ? " (Broadcast Priority Alert)" : ""
      }.`,
      isVerified: true,
    });

    const refreshedLogs = await getAuditLogs();
    setLogs(refreshedLogs);

    setGuideTitle("");
    setGuideCategory("Transit Advisory");
    setGuideIsBroadcast(false);
    setGuideContent("");
    setGuideDropoffs("");
    setNewGuideModalVisible(false);
    Alert.alert(
      guideIsBroadcast ? "Priority Alert Broadcasted" : "Advisory Published",
      guideIsBroadcast
        ? "Official high-priority broadcast alert is now live for all commuters."
        : "Official Transit Advisory is now live for all commuters."
    );
  }

  // Delete Transit Advisory Handler
  async function handleDeleteGuide(guide: FreshmenGuide) {
    const executeDelete = async () => {
      try {
        const updated = guides.filter((item) => item.id !== guide.id);
        setGuides(updated);
        await saveFreshmenGuides(updated);

        await appendAuditLog({
          actor: session?.user?.email || "University Admin",
          action: "TRANSIT_ADVISORY_DELETED",
          target: guide.title,
          details: `Deleted official transit advisory #${guide.id} (${guide.category}).`,
          isVerified: true,
        });

        const refreshedLogs = await getAuditLogs();
        setLogs(refreshedLogs);

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

  // 4. Feedback Triage Handler
  async function handleSaveTriage() {
    if (!triageReport) return;

    const isVerified = triageStatus === "verified";
    const nowIso = new Date().toISOString();

    const updated = reports.map((rep) =>
      rep.id === triageReport.id
        ? {
            ...rep,
            status: triageStatus,
            adminResponse: triageResponse.trim() || undefined,
            verifiedAt: isVerified ? nowIso : rep.verifiedAt,
          }
        : rep
    );

    setReports(updated);
    await saveCommuterReports(updated);

    await appendAuditLog({
      actor: session?.user?.email || "University Admin",
      action: "COMMUTER_REPORT_TRIAGED",
      target: `Report #${triageReport.id} (${triageReport.routeOrArea})`,
      details: `Status set to ${triageStatus}. Response: ${triageResponse.trim() || "No response comment"}`,
      isVerified: true,
    });

    const refreshedLogs = await getAuditLogs();
    setLogs(refreshedLogs);

    setTriageReport(null);
    Alert.alert(
      isVerified ? "Report Verified" : "Report Updated",
      `Report #${triageReport.id} status updated to "${triageStatus}".`
    );
  }

  function formatTimestamp(iso: string) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const filteredUsers = users.filter((u) => {
    if (userFilter === "all") return true;
    if (userFilter === "admins") return u.role === "admin";
    if (userFilter === "users") return u.role === "user";
    if (userFilter === "guests") return u.role === "guest";
    return true;
  });

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={GREEN} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <View style={styles.badgeRow}>
            <Text style={styles.headerTitle}>TARA-neta Admin Panel</Text>
            <View style={styles.adminPill}>
              <Text style={styles.adminPillText}>ADMIN CONSOLE</Text>
            </View>
          </View>
          <Text style={styles.headerSub}>DLSAU Transit & User Accounts Management Desk</Text>
        </View>
        <Pressable
          onPress={() => router.push("/guide" as any)}
          style={styles.refreshBtn}
          accessibilityRole="button"
          accessibilityLabel="Open Admin Guide"
        >
          <Ionicons name="book-outline" size={20} color={GREEN} />
        </Pressable>
        <Pressable
          onPress={async () => {
            setRefreshing(true);
            try {
              await loadAllData();
            } finally {
              setRefreshing(false);
            }
          }}
          style={styles.refreshBtn}
          accessibilityLabel="Refresh registered users"
        >
          <Ionicons name="refresh" size={20} color={GREEN} />
        </Pressable>
      </View>

      {/* Tab Navigation */}
      <View style={styles.navTabs}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navTabsContent}>
          {(
            [
              { key: "users", label: "Accounts", icon: "people" },
              { key: "routes", label: "Routes & Status", icon: "bus" },
              { key: "guides", label: "Advisories", icon: "megaphone" },
              { key: "feedback", label: "Feedback Desk", icon: "chatbubbles" },
              { key: "logs", label: "Audit Logs", icon: "time" },
            ] as const
          ).map((tab) => {
            const isSelected = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={async () => {
                  setActiveTab(tab.key);
                  if (tab.key === "feedback") {
                    const latest = await getCommuterReports();
                    setReports(latest);
                  } else if (tab.key === "logs") {
                    const latest = await getAuditLogs();
                    setLogs(latest);
                  } else if (tab.key === "guides") {
                    const latest = await getFreshmenGuides();
                    setGuides(latest);
                  } else if (tab.key === "routes") {
                    const latest = await getManagedRoutes();
                    setRoutes(latest);
                  }
                }}
                style={[styles.tabButton, isSelected && styles.tabButtonActive]}
              >
                <Ionicons name={tab.icon as any} size={16} color={isSelected ? "#fff" : "#64748b"} />
                <Text style={[styles.tabButtonText, isSelected && styles.tabButtonTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={GREEN} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                try {
                  await loadAllData();
                } finally {
                  setRefreshing(false);
                }
              }}
              colors={[GREEN]}
              tintColor={GREEN}
            />
          }
        >
          {/* =========================================================================
              TAB 1: USER ACCOUNTS MANAGEMENT (Requirements 1.1, 1.2, 1.3)
             ========================================================================= */}
          {activeTab === "users" && (
            <View>
              <View style={styles.sectionHeaderRow}>
                <View>
                  <Text style={styles.sectionTitle}>User Account Management</Text>
                  <Text style={styles.sectionSubtitle}>
                    Manage administrator, registered user, and guest accounts.
                  </Text>
                </View>
              </View>

              {/* Filter Pills */}
              <View style={styles.userFilterRow}>
                {(
                  [
                    { key: "all", label: "All Users" },
                    { key: "admins", label: "Admins" },
                    { key: "users", label: "Users" },
                    { key: "guests", label: "Guests" },
                  ] as const
                ).map((f) => (
                  <Pressable
                    key={f.key}
                    onPress={() => setUserFilter(f.key)}
                    style={[styles.filterChip, userFilter === f.key && styles.filterChipActive]}
                  >
                    <Text style={[styles.filterChipText, userFilter === f.key && styles.filterChipTextActive]}>
                      {f.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {filteredUsers.length === 0 ? (
                <View style={styles.emptyAccountsCard}>
                  <Ionicons name="people-outline" size={44} color="#94a3b8" />
                  <Text style={styles.emptyAccountsTitle}>No Accounts Found</Text>
                  <Text style={styles.emptyAccountsText}>
                    {userFilter === "all"
                      ? "No registered users found in the database yet."
                      : `No registered users currently match the "${userFilter}" filter.`}
                  </Text>
                </View>
              ) : (
                filteredUsers.map((u) => {
                  const badge = ROLE_BADGE_COLORS[u.role] || ROLE_BADGE_COLORS.user;
                  return (
                    <View key={u.id} style={styles.userCard}>
                      <View style={styles.userCardTop}>
                        <View style={styles.userAvatarBox}>
                          <Text style={styles.userAvatarLetter}>{u.fullName.charAt(0) || "U"}</Text>
                        </View>
                        <View style={styles.userInfo}>
                          <Text style={styles.userName} numberOfLines={1}>{u.fullName}</Text>
                          <Text style={styles.userEmail} numberOfLines={1} ellipsizeMode="tail">{u.email}</Text>
                          {u.departmentOrProgram && u.departmentOrProgram !== "Registered Student" ? (
                            <Text style={styles.userDept} numberOfLines={1}>{u.departmentOrProgram}</Text>
                          ) : null}
                        </View>
                        <Pressable
                          onPress={() => {
                            setSelectedUser(u);
                            setRoleModalVisible(true);
                          }}
                          style={styles.changeRoleBtn}
                        >
                          <Ionicons name="shield-outline" size={13} color={GREEN} style={{ marginRight: 4 }} />
                          <Text style={styles.changeRoleBtnText}>Change Role</Text>
                        </Pressable>
                      </View>

                      <View style={styles.userCardBottom}>
                        <View style={[styles.roleBadge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                          <Text style={[styles.roleBadgeText, { color: badge.text }]}>
                            {ROLE_LABELS[u.role]}
                          </Text>
                        </View>
                        <Text style={styles.userJoined}>Joined: {formatTimestamp(u.joinedAt)}</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* =========================================================================
              TAB 2: COMMUTING ROUTES & STATUS (Requirements 2.1, 3.2, 3.3, 3.4)
             ========================================================================= */}
          {activeTab === "routes" && (
            <View>
              <View style={styles.sectionHeaderRow}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={styles.sectionTitle}>Transit Routes & Fares</Text>
                  <Text style={styles.sectionSubtitle}>
                    Add new routes, modify fares per route, and manage route availability or detours.
                  </Text>
                </View>
                <Pressable
                  onPress={() => setNewRouteModalVisible(true)}
                  style={styles.createGuideBtn}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={styles.createGuideBtnText}>Add Route</Text>
                </Pressable>
              </View>

              {routes.length === 0 ? (
                <View style={styles.emptyAccountsCard}>
                  <TransitVehicleIcon type="jeepney" size={44} color="#94a3b8" />
                  <Text style={styles.emptyAccountsTitle}>No Routes Added Yet</Text>
                  <Text style={styles.emptyAccountsText}>
                    There are currently no active routes recorded. Administrators can register and update verified campus transit routes here.
                  </Text>
                </View>
              ) : (
                routes.map((r) => {
                  const isSuspended = r.status === "suspended";
                  const isRerouted = r.status === "rerouted";
                  const statusColor = isSuspended ? "#DC2626" : isRerouted ? "#D97706" : "#059669";
                  const statusBg = isSuspended ? "#FEE2E2" : isRerouted ? "#FEF3C7" : "#D1FAE5";

                  return (
                    <View key={r.routeId} style={styles.routeCard}>
                      <View style={styles.routeHeader}>
                        <View style={styles.routeIcon}>
                          <TransitVehicleIcon
                            type={r.vehicleType}
                            size={20}
                            color={GREEN}
                          />
                        </View>
                        <View style={styles.routeTitleWrap}>
                          <Text style={styles.routeName}>{r.routeName}</Text>
                          <Text style={styles.routeFromTo}>
                            {r.origin} ➔ {r.destination}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => {
                            setStatusModalRoute(r);
                            setRouteStatusChoice(r.status);
                            setRouteNotice(r.statusNotice || "");
                            const numMatch = r.fareText.match(/(\d+(?:\.\d+)?)/);
                            const defaultBase =
                              r.customFare ??
                              (numMatch ? Math.ceil(parseFloat(numMatch[1])) : 14);
                            setRouteFareInput(String(defaultBase));
                            setRouteSoloFareInput(
                              String(r.customSoloFare ?? 50)
                            );
                          }}
                          style={styles.statusChangeBtn}
                        >
                          <Text style={styles.statusChangeBtnText}>Edit Fare / Status</Text>
                        </Pressable>
                      </View>

                      <View style={styles.routeMetaRow}>
                        <View style={[styles.routeStatusPill, { backgroundColor: statusBg }]}>
                          <Text style={[styles.routeStatusText, { color: statusColor }]}>
                            {r.status.toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.routeFare}>Est. Fare: {r.fareText}</Text>
                        {(() => {
                          const s = getRouteSafetySummary(r.routeName, r.routeId);
                          return (
                            <View style={styles.adminSafetyBadge}>
                              <Ionicons name="shield-checkmark" size={12} color="#047857" />
                              <Text style={styles.adminSafetyBadgeText}>
                                Safety: ★ {s.averageRating.toFixed(1)} ({s.ratingCount})
                              </Text>
                            </View>
                          );
                        })()}
                      </View>

                      {r.statusNotice ? (
                        <View style={[styles.noticeBox, { borderColor: statusColor }]}>
                          <Ionicons name="information-circle" size={16} color={statusColor} />
                          <Text style={[styles.noticeText, { color: statusColor }]}>{r.statusNotice}</Text>
                        </View>
                      ) : null}

                      <View style={styles.landmarksWrap}>
                        <Text style={styles.landmarksLabel}>Key Landmarks & Transfer Points:</Text>
                        <View style={styles.landmarksList}>
                          {r.landmarks.map((lm, idx) => (
                            <View key={idx} style={styles.landmarkChip}>
                              <Text style={styles.landmarkChipText}>{lm}</Text>
                            </View>
                          ))}
                        </View>
                      </View>

                      <View style={styles.routeVerificationFooter}>
                        <Ionicons name="shield-checkmark" size={14} color="#059669" />
                        <Text style={styles.routeVerifiedText}>
                          Verified by {r.verifiedBy} · {formatTimestamp(r.lastUpdated)}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* =========================================================================
              TAB 3: TRANSIT ADVISORIES & ANNOUNCEMENTS (Requirements 4.2, 4.3, 4.4)
             ========================================================================= */}
          {activeTab === "guides" && (
            <View>
              <View style={styles.sectionHeaderRow}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={styles.sectionTitle}>Transit Advisories & Announcements</Text>
                  <Text style={styles.sectionSubtitle}>
                    Official travel advisories, route updates, and campus access guidance.
                  </Text>
                </View>
                <Pressable onPress={() => setNewGuideModalVisible(true)} style={styles.createGuideBtn}>
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={styles.createGuideBtnText}>Post Advisory</Text>
                </Pressable>
              </View>

              {guides.length === 0 ? (
                <View style={styles.emptyAccountsCard}>
                  <Ionicons name="megaphone-outline" size={44} color="#94a3b8" />
                  <Text style={styles.emptyAccountsTitle}>No Advisories Published Yet</Text>
                  <Text style={styles.emptyAccountsText}>
                    Tap "+ Post Advisory" above to publish transit alerts, route tips, and verified campus access guidance for all commuters.
                  </Text>
                </View>
              ) : (
                guides.map((g) => (
                  <View key={g.id} style={styles.guideItemCard}>
                    <View style={styles.guideItemHeader}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", flex: 1, marginRight: 8 }}>
                        <View style={styles.guideCategoryBadge}>
                          <Text style={styles.guideCategoryText}>{g.category}</Text>
                        </View>
                        {g.isPinned && (
                          <View style={styles.priorityBadge}>
                            <Text style={styles.priorityBadgeText}>BROADCAST ALERT</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={styles.guideTimestamp}>{formatTimestamp(g.publishedAt)}</Text>
                        <Pressable
                          onPress={() => handleDeleteGuide(g)}
                          style={styles.deleteGuideBtn}
                          accessibilityLabel={`Delete advisory ${g.title}`}
                        >
                          <Ionicons name="trash-outline" size={13} color="#ef4444" />
                          <Text style={styles.deleteGuideBtnText}>Delete</Text>
                        </Pressable>
                      </View>
                    </View>
                    <Text style={styles.guideItemTitle}>{g.title}</Text>
                    <Text style={styles.guideItemAuthor}>By {g.author}</Text>
                    <Text style={styles.guideItemContent}>{g.content}</Text>
                  </View>
                ))
              )}
            </View>
          )}

          {/* =========================================================================
              TAB 4: FEEDBACK DESK & COMMUTER REPORTS (Requirements 5.1, 5.2, 5.3)
             ========================================================================= */}
          {activeTab === "feedback" && (
            <View>
              <View style={styles.sectionHeaderRow}>
                <View>
                  <Text style={styles.sectionTitle}>Commuter Feedback & Reports</Text>
                  <Text style={styles.sectionSubtitle}>
                    Real-time commuter incident submissions, reroutes, and commuter inquiries.
                  </Text>
                </View>
              </View>

              {reports.length === 0 ? (
                <View style={styles.emptyAccountsCard}>
                  <Ionicons name="chatbubbles-outline" size={44} color="#94a3b8" />
                  <Text style={styles.emptyAccountsTitle}>No Commuter Reports Yet</Text>
                  <Text style={styles.emptyAccountsText}>
                    Issues submitted via the "Report Transit Issue" and "Commuter Feedback" forms will appear here for administrator review and response.
                  </Text>
                </View>
              ) : (
                reports.map((rep) => {
                  const statusInfo = REPORT_STATUS_DETAILS[rep.status] || {
                    label: rep.status,
                    color: "#475569",
                    bg: "#f1f5f9",
                  };
                  return (
                    <View key={rep.id} style={styles.triageCard}>
                      <View style={styles.triageHeader}>
                        <View>
                          <Text style={styles.triageId}>Report #{rep.id}</Text>
                          <Text style={styles.triageUser}>
                            By {rep.userName} ({rep.userRole.toUpperCase()})
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => {
                            setTriageReport(rep);
                            setTriageStatus(rep.status);
                            setTriageResponse(rep.adminResponse || "");
                          }}
                          style={styles.triageActionBtn}
                        >
                          <Text style={styles.triageActionBtnText}>Review / Triage</Text>
                        </Pressable>
                      </View>

                      <Text style={styles.triageRoute}>Location / Route: {rep.routeOrArea}</Text>
                      <Text style={styles.triageDesc}>{rep.description}</Text>

                      {rep.adminResponse ? (
                        <View style={styles.officialResponseBox}>
                          <Text style={styles.officialResponseLabel}>Admin Official Response:</Text>
                          <Text style={styles.officialResponseText}>{rep.adminResponse}</Text>
                        </View>
                      ) : null}

                      <View style={styles.triageFooter}>
                        <View
                          style={[
                            styles.triageStatusPill,
                            { backgroundColor: statusInfo.bg, borderColor: statusInfo.color },
                          ]}
                        >
                          <Text style={[styles.triageStatusText, { color: statusInfo.color }]}>
                            {statusInfo.label}
                          </Text>
                        </View>
                        <Text style={styles.triageDate}>{formatTimestamp(rep.submittedAt)}</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* =========================================================================
              TAB 5: DATE-STAMPED AUDIT LOGS (Requirement 3.4)
             ========================================================================= */}
          {activeTab === "logs" && (
            <View>
              <View style={styles.sectionHeaderRow}>
                <View>
                  <Text style={styles.sectionTitle}>Verification & Audit Logs</Text>
                  <Text style={styles.sectionSubtitle}>
                    Immutable date-stamped records of route alterations and administrator actions.
                  </Text>
                </View>
              </View>

              {logs.length === 0 ? (
                <View style={styles.emptyAccountsCard}>
                  <Ionicons name="time-outline" size={44} color="#94a3b8" />
                  <Text style={styles.emptyAccountsTitle}>No Audit Logs Recorded</Text>
                  <Text style={styles.emptyAccountsText}>
                    Date-stamped audit records will be generated automatically as user roles, routes, transit advisories, and commuter reports are managed.
                  </Text>
                </View>
              ) : (
                logs.map((log) => (
                  <View key={log.id} style={styles.logCard}>
                    <View style={styles.logHeader}>
                      <View style={styles.logActionPill}>
                        <Text style={styles.logActionText}>{log.action}</Text>
                      </View>
                      <Text style={styles.logTime}>{formatTimestamp(log.timestamp)}</Text>
                    </View>
                    <Text style={styles.logTarget}>{log.target}</Text>
                    <Text style={styles.logDetails}>{log.details}</Text>
                    <View style={styles.logFooter}>
                      <Ionicons name="person-circle" size={14} color="#64748b" />
                      <Text style={styles.logActor}>Actor: {log.actor}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* =========================================================================
          MODAL: ROLE EDITING (Requirements 1.1, 1.2, 1.3)
         ========================================================================= */}
      <Modal visible={roleModalVisible} transparent animationType="fade" onRequestClose={() => setRoleModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Change User Role</Text>
            <Text style={styles.modalSub}>
              Assign account permissions for {selectedUser?.fullName} ({selectedUser?.email})
            </Text>

            {(["admin", "user"] as UserRole[]).map((r) => {
              const isSelected = selectedUser?.role === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => selectedUser && handleAssignRole(selectedUser, r)}
                  style={[styles.roleSelectOption, isSelected && styles.roleSelectOptionActive]}
                >
                  <Ionicons
                    name={isSelected ? "radio-button-on" : "radio-button-off"}
                    size={20}
                    color={isSelected ? GREEN : "#94a3b8"}
                  />
                  <Text style={[styles.roleSelectOptionText, isSelected && styles.roleSelectOptionTextActive]}>
                    {ROLE_LABELS[r]}
                  </Text>
                </Pressable>
              );
            })}

            <Pressable onPress={() => setRoleModalVisible(false)} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* =========================================================================
          MODAL: ROUTE FARE & STATUS (Requirements 2.1, 3.2, 3.3)
         ========================================================================= */}
      <Modal visible={Boolean(statusModalRoute)} transparent animationType="fade" onRequestClose={() => setStatusModalRoute(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Route Fare & Availability</Text>
            <Text style={styles.modalSub}>{statusModalRoute?.routeName}</Text>

            <Text style={styles.modalFieldLabel}>
              {statusModalRoute?.hasTricycle || statusModalRoute?.vehicleType === "tricycle"
                ? "Regular / Shared Fare (₱ PHP):"
                : "Route Fare (₱ PHP):"}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. 14"
              value={routeFareInput}
              onChangeText={setRouteFareInput}
              keyboardType="numeric"
            />

            {(statusModalRoute?.hasTricycle || statusModalRoute?.vehicleType === "tricycle") && (
              <>
                <Text style={styles.modalFieldLabel}>
                  Tricycle Solo / Special Trip Fare (₱ PHP):
                </Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. 50"
                  value={routeSoloFareInput}
                  onChangeText={setRouteSoloFareInput}
                  keyboardType="numeric"
                />
              </>
            )}

            <Text style={styles.modalFieldLabel}>Select Operating Status:</Text>
            <View style={styles.statusButtonsRow}>
              {(
                [
                  { key: "active", label: "Active", color: "#059669" },
                  { key: "rerouted", label: "Rerouted", color: "#D97706" },
                  { key: "suspended", label: "Suspended", color: "#DC2626" },
                ] as const
              ).map((st) => (
                <Pressable
                  key={st.key}
                  onPress={() => setRouteStatusChoice(st.key)}
                  style={[
                    styles.statusChoiceBtn,
                    routeStatusChoice === st.key && {
                      borderColor: st.color,
                      backgroundColor: `${st.color}15`,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusChoiceText,
                      routeStatusChoice === st.key && { color: st.color, fontWeight: "700" },
                    ]}
                  >
                    {st.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.modalFieldLabel}>Advisory / Detour Note:</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Diverted via Gov. Pascual due to road works"
              value={routeNotice}
              onChangeText={setRouteNotice}
              multiline
            />

            <Pressable onPress={handleSaveRouteStatus} style={styles.modalSubmitBtn}>
              <Text style={styles.modalSubmitBtnText}>Save Fare & Status</Text>
            </Pressable>
            <Pressable onPress={() => setStatusModalRoute(null)} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* =========================================================================
          MODAL: ADD NEW ROUTE
         ========================================================================= */}
      <Modal
        visible={newRouteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNewRouteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <ScrollView
            style={{ width: "100%", maxWidth: 460 }}
            contentContainerStyle={{ justifyContent: "center", paddingVertical: 20 }}
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Add New Transit Route</Text>
              <Text style={styles.modalSub}>
                Register a new campus commute route with custom fare and vehicle instructions.
              </Text>

              <Text style={styles.modalFieldLabel}>Route Name *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Monumento / MCU to DLSAU Main Gate"
                value={newRouteName}
                onChangeText={setNewRouteName}
              />

              <Text style={styles.modalFieldLabel}>Origin / Boarding Terminal *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Monumento LRT Station / Victory Liner"
                value={newRouteOrigin}
                onChangeText={setNewRouteOrigin}
              />

              <Text style={styles.modalFieldLabel}>Destination</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="DLSAU Main Gate, Malabon"
                value={newRouteDestination}
                onChangeText={setNewRouteDestination}
              />

              <Text style={styles.modalFieldLabel}>Primary Transit Mode *</Text>
              <View style={styles.statusButtonsRow}>
                {(
                  [
                    { key: "jeepney", label: "Jeepney" },
                    { key: "tricycle", label: "Tricycle" },
                    { key: "bus", label: "Bus" },
                  ] as const
                ).map((mode) => {
                  const selected = newRouteVehicle === mode.key;
                  return (
                    <Pressable
                      key={mode.key}
                      onPress={() => {
                        setNewRouteVehicle(mode.key);
                        if (mode.key === "tricycle") setNewRouteFare("15");
                        else if (mode.key === "bus") setNewRouteFare("35");
                        else setNewRouteFare("14");
                      }}
                      style={[
                        styles.statusChoiceBtn,
                        selected && styles.statusChoiceBtnActive,
                        { flexDirection: "row", justifyContent: "center", gap: 6 },
                      ]}
                    >
                      <TransitVehicleIcon
                        type={mode.key}
                        size={16}
                        color={selected ? GREEN : "#64748b"}
                      />
                      <Text
                        style={[
                          styles.statusChoiceText,
                          selected && styles.statusChoiceTextActive,
                        ]}
                      >
                        {mode.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.modalFieldLabel}>
                {newRouteVehicle === "tricycle"
                  ? "Shared Fare (₱ PHP) *"
                  : "Regular Base Fare (₱ PHP) *"}
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder="14"
                value={newRouteFare}
                onChangeText={setNewRouteFare}
                keyboardType="numeric"
              />

              {newRouteVehicle === "tricycle" && (
                <>
                  <Text style={styles.modalFieldLabel}>
                    Solo / Special Trip Fare (₱ PHP)
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="50"
                    value={newRouteSoloFare}
                    onChangeText={setNewRouteSoloFare}
                    keyboardType="numeric"
                  />
                </>
              )}

              <Text style={styles.modalFieldLabel}>
                Signboard / Color to Look For (Optional)
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Malabon / Potrero / Victoneta or Yellow Tricycle"
                value={newRouteSignboard}
                onChangeText={setNewRouteSignboard}
              />

              <Text style={styles.modalFieldLabel}>
                What to Tell the Driver (Optional)
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Para po sa De La Salle Araneta / Victoneta Gate"
                value={newRouteWhatToSay}
                onChangeText={setNewRouteWhatToSay}
              />

              <Text style={styles.modalFieldLabel}>
                Key Landmarks (comma-separated)
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. MCU, Samson Road, Victoneta Ave, DLSAU Gate"
                value={newRouteLandmarks}
                onChangeText={setNewRouteLandmarks}
              />

              <Pressable onPress={handleCreateRoute} style={styles.modalSubmitBtn}>
                <Text style={styles.modalSubmitBtnText}>Create Route & Publish</Text>
              </Pressable>
              <Pressable
                onPress={() => setNewRouteModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Text style={styles.modalCloseBtnText}>Cancel</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* =========================================================================
          MODAL: POST TRANSIT ADVISORY (Requirement 4.2)
         ========================================================================= */}
      <Modal visible={newGuideModalVisible} transparent animationType="fade" onRequestClose={() => setNewGuideModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Post Transit Advisory</Text>
            <Text style={styles.modalSub}>Will be immediately accessible to all students and campus commuters.</Text>

            {/* Category Selection Buttons */}
            <Text style={styles.modalFieldLabel}>Category *</Text>
            <View style={styles.categoryButtonsRow}>
              {(
                [
                  { key: "Transit Advisory", label: "Transit Advisory", icon: "bus-outline" },
                  { key: "Campus Advisory", label: "Campus Advisory", icon: "school-outline" },
                  { key: "Fare Guide", label: "Fare Guides", icon: "cash-outline" },
                ] as const
              ).map((cat) => {
                const isSelected = guideCategory === cat.key;
                return (
                  <Pressable
                    key={cat.key}
                    onPress={() => setGuideCategory(cat.key)}
                    style={[
                      styles.categoryChoiceBtn,
                      isSelected && styles.categoryChoiceBtnActive,
                    ]}
                  >
                    <Ionicons
                      name={cat.icon as any}
                      size={13}
                      color={isSelected ? "#ffffff" : "#475569"}
                    />
                    <Text
                      style={[
                        styles.categoryChoiceBtnText,
                        isSelected && styles.categoryChoiceBtnTextActive,
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Checkbox for Priority Broadcast Alert */}
            <Pressable
              onPress={() => setGuideIsBroadcast(!guideIsBroadcast)}
              style={styles.checkboxRow}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: guideIsBroadcast }}
            >
              <View
                style={[
                  styles.checkboxBox,
                  guideIsBroadcast && styles.checkboxBoxActive,
                ]}
              >
                {guideIsBroadcast && (
                  <Ionicons name="checkmark" size={14} color="#ffffff" />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.checkboxLabel}>Broadcast Alert (Priority Alert)</Text>
                  <View style={styles.priorityBadge}>
                    <Text style={styles.priorityBadgeText}>HIGH PRIORITY</Text>
                  </View>
                </View>
                <Text style={styles.checkboxSub}>
                  Prominently highlights this notice with an amber priority alert banner at the top of commuter feeds.
                </Text>
              </View>
            </Pressable>

            <Text style={styles.modalFieldLabel}>Advisory Title *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Reroute Notice: Tullahan Bridge Construction or Getting to DLSAU"
              value={guideTitle}
              onChangeText={setGuideTitle}
            />

            <Text style={styles.modalFieldLabel}>Advisory Instructions & Details *</Text>
            <TextInput
              style={[styles.modalInput, { height: 100 }]}
              placeholder="Enter step-by-step transit directions, placards to look for, and alighting phrases..."
              value={guideContent}
              onChangeText={setGuideContent}
              multiline
            />

            <Pressable onPress={handleCreateGuide} style={styles.modalSubmitBtn}>
              <Text style={styles.modalSubmitBtnText}>Publish Advisory</Text>
            </Pressable>
            <Pressable onPress={() => setNewGuideModalVisible(false)} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* =========================================================================
          MODAL: TRIAGE FEEDBACK (Requirements 5.2, 5.3)
         ========================================================================= */}
      <Modal visible={Boolean(triageReport)} transparent animationType="fade" onRequestClose={() => setTriageReport(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Triage Commuter Report #{triageReport?.id}</Text>
            <Text style={styles.modalSub}>{triageReport?.description}</Text>

            <Text style={styles.modalFieldLabel}>Verification Status:</Text>
            <View style={styles.statusButtonsRow}>
              {(
                [
                  { key: "under_review", label: "Under Review" },
                  { key: "verified", label: "Verified" },
                  { key: "resolved", label: "Resolved" },
                ] as const
              ).map((st) => (
                <Pressable
                  key={st.key}
                  onPress={() => setTriageStatus(st.key)}
                  style={[styles.statusChoiceBtn, triageStatus === st.key && styles.statusChoiceBtnActive]}
                >
                  <Text style={[styles.statusChoiceText, triageStatus === st.key && styles.statusChoiceTextActive]}>
                    {st.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.modalFieldLabel}>Official Response / Advice to Commuter:</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Verified by campus transit team; acknowledged and noted."
              value={triageResponse}
              onChangeText={setTriageResponse}
              multiline
            />

            <Pressable onPress={handleSaveTriage} style={styles.modalSubmitBtn}>
              <Text style={styles.modalSubmitBtnText}>Save Report Status</Text>
            </Pressable>
            <Pressable onPress={() => setTriageReport(null)} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  backBtn: { padding: 6, marginRight: 8 },
  refreshBtn: { padding: 6, marginLeft: 8 },
  headerTitleWrap: { flex: 1 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#0f172a" },
  adminPill: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  adminPillText: { fontSize: 10, fontWeight: "800", color: GREEN },
  headerSub: { fontSize: 11, color: "#64748b", marginTop: 2 },
  roleTesterBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#a7f3d0",
  },
  roleTesterLabel: { fontSize: 12, color: "#065f46", marginLeft: 4 },
  roleTesterCurrent: { fontSize: 12, fontWeight: "700", color: GREEN, flex: 1 },
  switchRoleBtn: {
    backgroundColor: GREEN,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  switchRoleBtnText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  navTabs: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  navTabsContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  tabButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
  },
  tabButtonActive: { backgroundColor: GREEN },
  tabButtonText: { fontSize: 13, fontWeight: "600", color: "#475569" },
  tabButtonTextActive: { color: "#ffffff" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { padding: 16, paddingBottom: 40 },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#0f172a" },
  sectionSubtitle: { fontSize: 12, color: "#64748b", marginTop: 2, lineHeight: 17 },
  userFilterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 14 },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  filterChipActive: { backgroundColor: GREEN, borderColor: GREEN },
  filterChipText: { fontSize: 12, color: "#475569", fontWeight: "600" },
  filterChipTextActive: { color: "#ffffff" },
  userCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  userCardTop: { flexDirection: "row", alignItems: "center" },
  userAvatarBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e0f2fe",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  userAvatarLetter: { fontSize: 16, fontWeight: "700", color: "#0369a1" },
  userInfo: { flex: 1, marginRight: 8 },
  userName: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  userEmail: { fontSize: 12, color: "#64748b" },
  userDept: { fontSize: 11, color: GREEN, marginTop: 2 },
  changeRoleBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GREEN,
    flexShrink: 0,
  },
  changeRoleBtnText: { fontSize: 11, fontWeight: "700", color: GREEN },
  userCardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  roleBadgeText: { fontSize: 11, fontWeight: "700" },
  userJoined: { fontSize: 11, color: "#94a3b8" },
  routeCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  routeHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  routeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  routeTitleWrap: { flex: 1, marginRight: 6 },
  routeName: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  routeFromTo: { fontSize: 12, color: "#64748b", marginTop: 1 },
  statusChangeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    flexShrink: 0,
  },
  statusChangeBtnText: { fontSize: 12, fontWeight: "700", color: "#1e293b" },
  routeMetaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  routeStatusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  routeStatusText: { fontSize: 11, fontWeight: "800" },
  routeFare: { fontSize: 12, color: "#475569", fontWeight: "600" },
  adminSafetyBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
    marginLeft: "auto",
  },
  adminSafetyBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#047857",
  },
  noticeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: "#fff",
    marginTop: 8,
  },
  noticeText: { fontSize: 12, flex: 1 },
  landmarksWrap: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#f1f5f9" },
  landmarksLabel: { fontSize: 11, fontWeight: "700", color: "#64748b", marginBottom: 4 },
  landmarksList: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  landmarkChip: { backgroundColor: "#f8fafc", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: "#e2e8f0" },
  landmarkChipText: { fontSize: 10, color: "#334155" },
  routeVerificationFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    paddingTop: 6,
  },
  routeVerifiedText: { fontSize: 10, color: "#059669" },
  createGuideBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: GREEN,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flexShrink: 0,
  },
  createGuideBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  guideItemCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  guideItemHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  guideCategoryBadge: { backgroundColor: "#eff6ff", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  guideCategoryText: { fontSize: 11, fontWeight: "700", color: "#1d4ed8" },
  guideTimestamp: { fontSize: 11, color: "#94a3b8" },
  deleteGuideBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
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
  guideItemTitle: { fontSize: 15, fontWeight: "700", color: "#0f172a", marginTop: 6 },
  guideItemAuthor: { fontSize: 11, color: "#64748b", marginTop: 1, marginBottom: 8, fontStyle: "italic" },
  guideItemContent: { fontSize: 13, color: "#334155", lineHeight: 19 },
  guidePointsBox: { marginTop: 8, backgroundColor: "#f8fafc", padding: 8, borderRadius: 6 },
  guidePointsHeading: { fontSize: 11, fontWeight: "700", color: "#475569" },
  guidePointsContent: { fontSize: 11, color: GREEN, marginTop: 2 },
  triageCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  triageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  triageId: { fontSize: 13, fontWeight: "800", color: GREEN },
  triageUser: { fontSize: 11, color: "#64748b" },
  triageActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: "#f1f5f9",
  },
  triageActionBtnText: { fontSize: 12, fontWeight: "700", color: "#1e293b" },
  triageRoute: { fontSize: 13, fontWeight: "700", color: "#0f172a", marginTop: 8 },
  triageDesc: { fontSize: 13, color: "#334155", marginTop: 4, lineHeight: 18 },
  triageFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  triageStatusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  triageStatusText: { fontSize: 10, fontWeight: "800" },
  triageDate: { fontSize: 11, color: "#94a3b8" },
  officialResponseBox: {
    marginTop: 8,
    padding: 8,
    borderRadius: 6,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  officialResponseLabel: { fontSize: 11, fontWeight: "700", color: GREEN },
  officialResponseText: { fontSize: 12, color: "#166534", marginTop: 2 },
  broadcastNoticePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#86efac",
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  broadcastNoticeText: {
    fontSize: 12,
    color: "#15803d",
    lineHeight: 16,
    flex: 1,
    fontWeight: "500",
  },
  logCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  logHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logActionPill: { backgroundColor: "#f1f5f9", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  logActionText: { fontSize: 10, fontWeight: "800", color: "#334155" },
  logTime: { fontSize: 11, color: "#94a3b8" },
  logTarget: { fontSize: 14, fontWeight: "700", color: "#0f172a", marginTop: 4 },
  logDetails: { fontSize: 12, color: "#475569", marginTop: 2, lineHeight: 16 },
  logFooter: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  logActor: { fontSize: 11, color: "#64748b" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 18,
    maxHeight: "85%",
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#0f172a" },
  modalSub: { fontSize: 12, color: "#64748b", marginTop: 2, marginBottom: 14 },
  modalFieldLabel: { fontSize: 13, fontWeight: "700", color: "#334155", marginTop: 10, marginBottom: 6 },
  modalInput: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: "#0f172a",
    marginBottom: 10,
  },
  roleSelectOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 6,
  },
  roleSelectOptionActive: { backgroundColor: "#f0fdf4", borderColor: GREEN },
  roleSelectOptionText: { fontSize: 14, color: "#334155" },
  roleSelectOptionTextActive: { fontWeight: "700", color: GREEN },
  statusButtonsRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  statusChoiceBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
    backgroundColor: "#f8fafc",
  },
  statusChoiceBtnActive: { borderColor: GREEN, backgroundColor: "#f0fdf4" },
  statusChoiceText: { fontSize: 12, fontWeight: "600", color: "#475569" },
  statusChoiceTextActive: { color: GREEN, fontWeight: "700" },
  categoryButtonsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  categoryChoiceBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },
  categoryChoiceBtnActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  categoryChoiceBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
    textAlign: "center",
  },
  categoryChoiceBtnTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#d97706",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxBoxActive: {
    backgroundColor: "#d97706",
    borderColor: "#d97706",
  },
  checkboxLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#92400e",
  },
  priorityBadge: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  priorityBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#ffffff",
  },
  checkboxSub: {
    fontSize: 11,
    color: "#b45309",
    marginTop: 2,
    lineHeight: 15,
  },
  modalSubmitBtn: {
    backgroundColor: GREEN,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  modalSubmitBtnText: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
  modalCloseBtn: { alignItems: "center", paddingVertical: 10, marginTop: 4 },
  modalCloseBtnText: { color: "#64748b", fontSize: 13, fontWeight: "600" },
  emptyAccountsCard: {
    paddingVertical: 44,
    paddingHorizontal: 20,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginTop: 8,
  },
  emptyAccountsTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#334155",
    marginTop: 10,
    marginBottom: 4,
  },
  emptyAccountsText: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
  },
});