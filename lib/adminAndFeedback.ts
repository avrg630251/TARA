import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import {
  STATIC_CUSTOM_POINTS,
  STATIC_CUSTOM_SEGMENTS,
} from "@/lib/customRoutesStatic";

export type UserRole =
  | "admin"   // System & University Administrator
  | "user"    // Registered User (students, faculty, employees)
  | "guest";  // Public or guest user (read-only navigation, no bookmarks/history/profile)

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrator",
  user: "Registered User",
  guest: "Guest Commuter",
};

export const ROLE_BADGE_COLORS: Record<UserRole, { bg: string; text: string; border: string }> = {
  admin: { bg: "#FEF3C7", text: "#92400E", border: "#FDE68A" },
  user: { bg: "#D1FAE5", text: "#065F46", border: "#A7F3D0" },
  guest: { bg: "#F3F4F6", text: "#374151", border: "#E5E7EB" },
};

// ----------------------------------------------------------------------------
// 1. Managed User Accounts (Requirements 1.1, 1.2, 1.3)
// ----------------------------------------------------------------------------
export type ManagedUserAccount = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  schoolName: string;
  departmentOrProgram?: string;
  status: "active" | "suspended" | "pending";
  joinedAt: string;
};

const SEED_USERS: ManagedUserAccount[] = [];

// ----------------------------------------------------------------------------
// 2. Commuting Routes & Availability Records (Requirements 2.1, 3.2, 3.3, 3.4)
// ----------------------------------------------------------------------------
export type RouteAvailabilityStatus = "active" | "suspended" | "rerouted";

export type ManagedRoute = {
  routeId: string;
  routeName: string;
  origin: string;
  destination: string;
  vehicleType: "jeepney" | "bus" | "tricycle";
  landmarks: string[];
  fareText: string;
  /** Numeric regular/shared fare set or overridden by admin */
  customFare?: number | null;
  /** Numeric solo/special fare for tricycle routes set or overridden by admin */
  customSoloFare?: number | null;
  /** Whether this route includes a tricycle leg */
  hasTricycle?: boolean;
  /** Whether this route was added manually by an admin via the Admin Panel */
  isCustomAdminRoute?: boolean;
  signboard?: string;
  whatToSay?: string;
  originLat?: number;
  originLng?: number;
  status: RouteAvailabilityStatus;
  statusNotice?: string;
  lastUpdated: string;
  verifiedBy: string;
};

const SEED_ROUTES: ManagedRoute[] = [];

// ----------------------------------------------------------------------------
// 3. Transit Advisories & Travel Announcements (Requirements 4.2, 4.3, 4.4)
// ----------------------------------------------------------------------------
export type TransitAdvisory = {
  id: string;
  title: string;
  category: "Campus Advisory" | "Transit Advisory" | "Route Notice" | "Fare Guide" | "Freshmen Orientation";
  targetAudience: "incoming_freshmen" | "all_students" | "all";
  content: string;
  recommendedOrigins: string[];
  pickupOrDropoffPoints: string[];
  publishedAt: string;
  author: string;
  isPinned: boolean;
};

export type FreshmenGuide = TransitAdvisory;

const SEED_GUIDES: TransitAdvisory[] = [];

// ----------------------------------------------------------------------------
// 4. Commuter Reports & Feedback Channels (Requirements 3.3, 4.2, 5.1, 5.2, 5.3)
// ----------------------------------------------------------------------------
export type CommuterReportCategory =
  | "road_update"        // Road updates, flood, road repairs
  | "reroute_suspension" // Vehicle suspensions, strike, reroute
  | "freshmen_inquiry"   // Questions about transit routes, orientation, or campus commute
  | "commuter_feedback"; // General feedback, fare overcharging, driver concerns

export const REPORT_CATEGORY_LABELS: Record<CommuterReportCategory, { label: string; icon: string; desc: string }> = {
  road_update: {
    label: "Road Update & Traffic Disruption",
    icon: "alert-circle",
    desc: "Report flooded streets, construction, or blocked roads on student routes",
  },
  reroute_suspension: {
    label: "Route Reroute or Temporary Suspension",
    icon: "swap-horizontal",
    desc: "Notify administrators of transport strikes, terminal transfers, or temporary reroutes",
  },
  freshmen_inquiry: {
    label: "Commuter Question / Transit Inquiry",
    icon: "help-circle",
    desc: "Inquiries about getting to DLSAU campus, stops, or transit routes",
  },
  commuter_feedback: {
    label: "General Commuter Feedback & Concern",
    icon: "chatbox-ellipses",
    desc: "Suggestions, fare issues, or route schedule corrections",
  },
};

export type CommuterReportStatus =
  | "submitted"
  | "under_review"
  | "verified"
  | "resolved";

export const REPORT_STATUS_DETAILS: Record<CommuterReportStatus, { label: string; color: string; bg: string }> = {
  submitted: { label: "Submitted (Pending Review)", color: "#B45309", bg: "#FEF3C7" },
  under_review: { label: "Under University Review", color: "#1D4ED8", bg: "#DBEAFE" },
  verified: { label: "Verified", color: "#047857", bg: "#D1FAE5" },
  resolved: { label: "Resolved / Logged", color: "#374151", bg: "#F3F4F6" },
};

export type CommuterReport = {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  category: CommuterReportCategory;
  routeOrArea: string;
  description: string;
  urgency: "normal" | "high" | "critical";
  status: CommuterReportStatus;
  adminResponse?: string;
  submittedAt: string;
  verifiedAt?: string;
};

const SEED_REPORTS: CommuterReport[] = [];

// ----------------------------------------------------------------------------
// 5. Date-stamped System Audit & Verification Logs (Requirement 3.4)
// ----------------------------------------------------------------------------
export type AuditLogEntry = {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  details: string;
  isVerified: boolean;
};

const SEED_AUDIT_LOGS: AuditLogEntry[] = [];

// ----------------------------------------------------------------------------
// Storage Keys & API Helper Functions
// ----------------------------------------------------------------------------
const STORAGE_KEYS = {
  USERS: "tara:admin:managed_users",
  ROUTES: "tara:admin:managed_routes",
  GUIDES: "tara:admin:freshmen_guides",
  REPORTS: "tara:admin:commuter_reports",
  LOGS: "tara:admin:audit_logs",
  ACTIVE_ROLE_OVERRIDE: "tara:user:active_role_override",
};

export async function getManagedUsers(): Promise<ManagedUserAccount[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.USERS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Filter out any legacy placeholder mock users
        const cleaned = parsed.filter(
          (u) =>
            u.id &&
            !u.id.startsWith("usr_") &&
            u.email !== "admin@dlsau.edu.ph" &&
            u.email !== "guest.commuter@tara.app" &&
            u.email !== "juan.delacruz@dlsau.edu.ph" &&
            u.email !== "bea.alonzo@gmail.com"
        );
        return cleaned;
      }
    }
  } catch {}
  return [];
}

export async function saveManagedUsers(users: ManagedUserAccount[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
}

/**
 * Records or updates a registered user in both local storage and Supabase public.profiles
 * so the Admin Panel Accounts tab always has a complete list of registered users.
 */
export async function recordRegisteredUser(user: {
  id: string;
  email: string;
  fullName?: string;
  role?: UserRole;
  departmentOrProgram?: string;
  joinedAt?: string;
}): Promise<void> {
  if (!user.id || !user.email) return;
  const cleanEmail = user.email.trim().toLowerCase();
  const displayName =
    user.fullName?.trim() ||
    cleanEmail.split("@")[0] ||
    "Registered User";
  const role: UserRole = user.role || "user";
  const joinedAt = user.joinedAt || new Date().toISOString();

  try {
    const existing = await getManagedUsers();
    const idx = existing.findIndex(
      (u) => u.id === user.id || u.email.trim().toLowerCase() === cleanEmail
    );
    if (idx >= 0) {
      existing[idx] = {
        ...existing[idx],
        id: user.id,
        email: cleanEmail,
        fullName:
          displayName !== "Registered User"
            ? displayName
            : existing[idx].fullName || displayName,
        role: existing[idx].role === "admin" ? "admin" : role,
      };
    } else {
      existing.unshift({
        id: user.id,
        email: cleanEmail,
        fullName: displayName,
        role,
        schoolName: "De La Salle Araneta University",
        departmentOrProgram: user.departmentOrProgram || "Registered Student",
        status: "active",
        joinedAt,
      });
    }
    await saveManagedUsers(existing);
  } catch {}

  try {
    await supabase.from("profiles").upsert(
      {
        id: user.id,
        email: cleanEmail,
        full_name: displayName,
        role,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
  } catch {}
}

let cachedManagedRoutes: ManagedRoute[] | null = null;
const routeSubscribers = new Set<() => void>();

export function subscribeToManagedRoutes(cb: () => void): () => void {
  routeSubscribers.add(cb);
  return () => {
    routeSubscribers.delete(cb);
  };
}

function notifyManagedRoutesChanged() {
  for (const cb of routeSubscribers) {
    try {
      cb();
    } catch {}
  }
}

export function getCustomBaseRoutes(): ManagedRoute[] {
  const pointMap = new Map(
    STATIC_CUSTOM_POINTS.map((p) => [p.point_id, p])
  );

  const itineraries: Record<
    string,
    { id: string; name: string; segments: any[] }
  > = {};

  for (const seg of STATIC_CUSTOM_SEGMENTS as unknown as any[]) {
    if (!itineraries[seg.itinerary_id]) {
      itineraries[seg.itinerary_id] = {
        id: seg.itinerary_id,
        name: seg.itinerary_name,
        segments: [],
      };
    }
    itineraries[seg.itinerary_id].segments.push(seg);
  }

  const routes: ManagedRoute[] = [];

  for (const [itinId, data] of Object.entries(itineraries)) {
    data.segments.sort((a, b) => a.segment_sequence - b.segment_sequence);
    const firstSeg = data.segments[0];
    const lastSeg = data.segments[data.segments.length - 1];
    const originPoint = pointMap.get(firstSeg.from_point_id);
    const destPoint = pointMap.get(lastSeg.to_point_id);

    const vehicleTypes = [
      ...new Set(
        data.segments
          .map((s) => s.segment_type)
          .filter((t) => t !== "walk")
      ),
    ];
    const landmarks = data.segments
      .map((s) => s.segment_name)
      .filter(Boolean) as string[];

    const hasTricycle = vehicleTypes.includes("tricycle");
    const sharedTotal = data.segments.reduce((acc, s) => {
      if (s.segment_type === "walk") return acc;
      const leg =
        s.fare ??
        (s.segment_type === "tricycle"
          ? 15
          : s.segment_type === "bus"
            ? 35
            : 14);
      return acc + Math.ceil(Number(leg));
    }, 0);

    const soloTotal = data.segments.reduce((acc, s) => {
      if (s.segment_type === "walk") return acc;
      if (s.segment_type === "tricycle") return acc + 50;
      const leg = s.fare ?? (s.segment_type === "bus" ? 35 : 14);
      return acc + Math.ceil(Number(leg));
    }, 0);

    let vehicleType: "jeepney" | "bus" | "tricycle" = "jeepney";
    if (vehicleTypes.includes("bus")) vehicleType = "bus";
    else if (vehicleTypes.includes("tricycle") && !vehicleTypes.includes("jeepney")) {
      vehicleType = "tricycle";
    }

    const defaultFareText = hasTricycle
      ? `₱${sharedTotal} shared · ₱${soloTotal} solo`
      : `Php ${sharedTotal.toFixed(2)}`;

    routes.push({
      routeId: itinId,
      routeName: data.name,
      origin: originPoint?.name || firstSeg.from_point_id,
      destination: destPoint?.name || "DLSAU Main Campus",
      vehicleType,
      landmarks,
      fareText: defaultFareText,
      customFare: sharedTotal,
      customSoloFare: hasTricycle ? soloTotal : null,
      hasTricycle,
      status: "active",
      lastUpdated: new Date().toISOString(),
      verifiedBy: "DLSAU Transit Administration",
    });
  }

  return routes;
}

export async function getManagedRoutes(): Promise<ManagedRoute[]> {
  const baseRoutes = getCustomBaseRoutes();

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.ROUTES);
    if (raw) {
      const overrides: ManagedRoute[] = JSON.parse(raw);
      if (Array.isArray(overrides)) {
        const mergedBase = baseRoutes.map((base) => {
          const matched = overrides.find(
            (o) =>
              o.routeId === base.routeId ||
              o.routeName?.trim().toLowerCase() === base.routeName.trim().toLowerCase()
          );
          if (matched) {
            return {
              ...base,
              fareText: matched.fareText || base.fareText,
              customFare:
                matched.customFare !== undefined ? matched.customFare : base.customFare,
              customSoloFare:
                matched.customSoloFare !== undefined
                  ? matched.customSoloFare
                  : base.customSoloFare,
              hasTricycle:
                matched.hasTricycle !== undefined ? matched.hasTricycle : base.hasTricycle,
              landmarks:
                Array.isArray(matched.landmarks) && matched.landmarks.length > 0
                  ? matched.landmarks
                  : base.landmarks,
              status: matched.status || base.status,
              statusNotice: matched.statusNotice,
              lastUpdated: matched.lastUpdated || base.lastUpdated,
              verifiedBy: matched.verifiedBy || base.verifiedBy,
            };
          }
          return base;
        });

        // Append any custom routes created by an admin
        const baseIds = new Set(baseRoutes.map((b) => b.routeId));
        const adminAddedRoutes = overrides.filter(
          (o) => o && o.routeId && !baseIds.has(o.routeId)
        );
        const result = [...mergedBase, ...adminAddedRoutes];
        cachedManagedRoutes = result;
        return result;
      }
    }
  } catch {}

  cachedManagedRoutes = baseRoutes;
  return baseRoutes;
}

export function getCachedRouteOverride(
  routeIdOrName?: string | null
): ManagedRoute | null {
  if (!routeIdOrName || !cachedManagedRoutes) return null;
  const cleaned = routeIdOrName.replace(/^custom:/i, "").trim().toLowerCase();
  return (
    cachedManagedRoutes.find(
      (r) =>
        r.routeId.trim().toLowerCase() === cleaned ||
        r.routeName.trim().toLowerCase() === cleaned
    ) ?? null
  );
}

export function getCachedAdminAddedRoutes(): ManagedRoute[] {
  if (!cachedManagedRoutes) return [];
  return cachedManagedRoutes.filter((r) => r.isCustomAdminRoute);
}

export async function saveManagedRoutes(routes: ManagedRoute[]): Promise<void> {
  cachedManagedRoutes = routes;
  await AsyncStorage.setItem(STORAGE_KEYS.ROUTES, JSON.stringify(routes));
  notifyManagedRoutesChanged();
}

export async function getFreshmenGuides(): Promise<FreshmenGuide[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.GUIDES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter(
          (g) =>
            g &&
            g.id &&
            g.id !== "gd_freshmen_orientation_2026" &&
            g.id !== "gd_gate_access_rules" &&
            g.id !== "gd_fare_discount_guide"
        );
        return cleaned;
      }
    }
  } catch {}
  return [];
}

export async function saveFreshmenGuides(guides: FreshmenGuide[]): Promise<void> {
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  const unique: FreshmenGuide[] = [];

  for (const g of guides) {
    if (!g || !g.id) continue;
    const normalizedTitle = g.title?.trim().toLowerCase();
    if (seenIds.has(g.id) || (normalizedTitle && seenTitles.has(normalizedTitle))) {
      continue;
    }
    seenIds.add(g.id);
    if (normalizedTitle) seenTitles.add(normalizedTitle);
    unique.push(g);
  }

  await AsyncStorage.setItem(STORAGE_KEYS.GUIDES, JSON.stringify(unique));
}

export const getTransitAdvisories = getFreshmenGuides;
export const saveTransitAdvisories = saveFreshmenGuides;

export async function getCommuterReports(): Promise<CommuterReport[]> {
  let combined: CommuterReport[] = [];

  // 1. Load from local device storage first
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.REPORTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        combined = parsed.filter(
          (r) =>
            r &&
            r.id &&
            r.id !== "rep_101" &&
            r.id !== "rep_102" &&
            r.id !== "rep_103"
        );
      }
    }
  } catch {}

  // 2. Query Supabase for cloud-synced reports across devices/users
  try {
    const { data, error } = await supabase
      .from("commuter_reports")
      .select("*")
      .order("submitted_at", { ascending: false });

    if (!error && data && Array.isArray(data)) {
      const dbReports: CommuterReport[] = data.map((d: any) => ({
        id: d.id,
        userId: d.user_id,
        userName: d.user_name,
        userRole: (d.user_role as UserRole) || "user",
        category: d.category as CommuterReportCategory,
        routeOrArea: d.route_or_area,
        description: d.description,
        urgency: d.urgency,
        status: d.status as CommuterReportStatus,
        adminResponse: d.admin_response || undefined,
        submittedAt: d.submitted_at || new Date().toISOString(),
        verifiedAt: d.verified_at || undefined,
      }));

      // Merge unique by id
      for (const rep of dbReports) {
        const idx = combined.findIndex((c) => c.id === rep.id);
        if (idx === -1) {
          combined.push(rep);
        } else {
          // Keep the newer or triaged version
          combined[idx] = { ...combined[idx], ...rep };
        }
      }
      // Re-sort descending by timestamp
      combined.sort(
        (a, b) =>
          new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      );
      await AsyncStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(combined));
    }
  } catch {}

  return combined;
}

export async function saveCommuterReports(reports: CommuterReport[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));

  // Sync latest status to Supabase in the background
  try {
    for (const rep of reports) {
      await supabase.from("commuter_reports").upsert(
        {
          id: rep.id,
          user_id: rep.userId,
          user_name: rep.userName,
          user_role: rep.userRole,
          category: rep.category,
          route_or_area: rep.routeOrArea,
          description: rep.description,
          urgency: rep.urgency,
          status: rep.status,
          admin_response: rep.adminResponse || null,
          submitted_at: rep.submittedAt,
          verified_at: rep.verifiedAt || null,
        },
        { onConflict: "id" }
      );
    }
  } catch {}
}

export async function addCommuterReport(
  report: Omit<CommuterReport, "id" | "submittedAt" | "status">
): Promise<CommuterReport> {
  const current = await getCommuterReports();
  const newReport: CommuterReport = {
    ...report,
    id: `rep_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
    submittedAt: new Date().toISOString(),
    status: "submitted",
  };
  const updated = [newReport, ...current];
  await saveCommuterReports(updated);

  // Attempt Supabase insert
  try {
    await supabase.from("commuter_reports").insert({
      id: newReport.id,
      user_id: newReport.userId,
      user_name: newReport.userName,
      user_role: newReport.userRole,
      category: newReport.category,
      route_or_area: newReport.routeOrArea,
      description: newReport.description,
      urgency: newReport.urgency,
      status: newReport.status,
      submitted_at: newReport.submittedAt,
    });
  } catch {}

  // Auto-record audit log for report submission
  void appendAuditLog({
    actor: newReport.userName,
    action: "COMMUTER_REPORT_SUBMITTED",
    target: newReport.routeOrArea,
    details: `[${REPORT_CATEGORY_LABELS[newReport.category]?.label || newReport.category}] ${newReport.description.slice(0, 100)}`,
    isVerified: false,
  });

  return newReport;
}

export async function getAuditLogs(): Promise<AuditLogEntry[]> {
  let combined: AuditLogEntry[] = [];

  // 1. Load from local device storage
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.LOGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        combined = parsed.filter(
          (l) =>
            l &&
            l.id &&
            !l.id.startsWith("log_0") &&
            l.actor !== "Elena Santos (Admissions Admin)" &&
            l.actor !== "Admin (Tech Team)"
        );
      }
    }
  } catch {}

  // 2. Query Supabase for cloud audit logs
  try {
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .order("timestamp", { ascending: false });

    if (!error && data && Array.isArray(data)) {
      const dbLogs: AuditLogEntry[] = data.map((d: any) => ({
        id: d.id,
        actor: d.actor,
        action: d.action,
        target: d.target,
        details: d.details,
        isVerified: d.is_verified ?? true,
        timestamp: d.timestamp || new Date().toISOString(),
      }));

      for (const log of dbLogs) {
        if (!combined.some((c) => c.id === log.id)) {
          combined.push(log);
        }
      }
      combined.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      await AsyncStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(combined.slice(0, 60)));
    }
  } catch {}

  return combined;
}

export async function appendAuditLog(
  entry: Omit<AuditLogEntry, "id" | "timestamp">
): Promise<void> {
  const logs = await getAuditLogs();
  const newLog: AuditLogEntry = {
    ...entry,
    id: `log_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
  };
  const updated = [newLog, ...logs].slice(0, 60);
  await AsyncStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(updated));

  // Sync to Supabase in the background
  try {
    await supabase.from("audit_logs").insert({
      id: newLog.id,
      actor: newLog.actor,
      action: newLog.action,
      target: newLog.target,
      details: newLog.details,
      is_verified: newLog.isVerified,
      timestamp: newLog.timestamp,
    });
  } catch {}
}
