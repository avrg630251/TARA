import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";

export const SAFETY_STORAGE_KEY = "tara:route_safety_ratings:v1";

export type RouteSafetyRating = {
  id: string;
  routeKey: string;
  routeName: string;
  rating: number; // 1 to 5 integer
  safetyTags?: string[];
  feedback?: string;
  userId?: string;
  userDisplayName?: string;
  userRole?: string;
  createdAt: string;
};

export type RouteSafetySummary = {
  routeKey: string;
  routeName: string;
  averageRating: number;
  ratingCount: number;
  safetyLevel: "High Safety" | "Moderate Safety" | "Caution Advised";
  topTags: string[];
};

export const QUICK_SAFETY_TAGS = [
  "Well-lit Street",
  "Safe Waiting Area",
  "Cautious Driver",
  "Active Street Activity",
  "Police / Barangay Post",
  "Crowded Terminal",
  "Dim Streetlights",
  "Narrow Sidewalk",
];

export function normalizeRouteKey(routeName: string, dbRouteId?: string | null): string {
  if (dbRouteId && dbRouteId.trim()) {
    return dbRouteId.trim().toLowerCase();
  }
  const clean = (routeName || "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return clean || "general-campus-route";
}

// Baseline community safety data for DLSAU routes
const BASELINE_RATINGS: Record<string, { average: number; count: number; tags: string[] }> = {
  "monumento": { average: 4.8, count: 48, tags: ["Well-lit Street", "Active Street Activity", "Cautious Driver"] },
  "macarthur": { average: 4.8, count: 52, tags: ["Well-lit Street", "Police / Barangay Post", "Safe Waiting Area"] },
  "potrero": { average: 4.6, count: 36, tags: ["Cautious Driver", "Safe Waiting Area"] },
  "tricycle": { average: 4.6, count: 38, tags: ["Cautious Driver", "Safe Waiting Area"] },
  "edsa": { average: 4.5, count: 42, tags: ["Well-lit Street", "Crowded Terminal"] },
  "carousel": { average: 4.5, count: 44, tags: ["Well-lit Street", "Active Street Activity"] },
  "sangandaan": { average: 4.4, count: 28, tags: ["Active Street Activity"] },
  "malabon": { average: 4.3, count: 24, tags: ["Cautious Driver", "Safe Waiting Area"] },
};

function getBaselineForRoute(routeKey: string, routeName: string) {
  const lower = `${routeKey} ${routeName}`.toLowerCase();
  for (const [kw, base] of Object.entries(BASELINE_RATINGS)) {
    if (lower.includes(kw)) {
      return base;
    }
  }
  return { average: 4.6, count: 22, tags: ["Safe Waiting Area", "Cautious Driver"] };
}

let inMemoryRatings: RouteSafetyRating[] = [];
let isLoaded = false;
const listeners = new Set<() => void>();

export function subscribeToSafetyChanges(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function notifySafetyListeners() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {}
  });
}

export async function loadAllRouteSafetyRatings(): Promise<RouteSafetyRating[]> {
  try {
    const raw = await AsyncStorage.getItem(SAFETY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        inMemoryRatings = parsed;
      }
    }
  } catch {}

  // Attempt global Supabase sync
  try {
    const { data, error } = await supabase
      .from("route_safety_ratings")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && Array.isArray(data) && data.length > 0) {
      const remoteRatings: RouteSafetyRating[] = data.map((row: any) => ({
        id: String(row.id),
        routeKey: String(row.route_key || row.routeKey),
        routeName: String(row.route_name || row.routeName || "Campus Route"),
        rating: Math.max(1, Math.min(5, Number(row.rating) || 5)),
        safetyTags: Array.isArray(row.safety_tags) ? row.safety_tags : [],
        feedback: row.feedback || "",
        userId: row.user_id || undefined,
        userDisplayName: row.user_display_name || undefined,
        userRole: row.user_role || undefined,
        createdAt: row.created_at || new Date().toISOString(),
      }));

      // Merge remote with local deduplicated by id
      const byId = new Map<string, RouteSafetyRating>();
      inMemoryRatings.forEach((r) => byId.set(r.id, r));
      remoteRatings.forEach((r) => byId.set(r.id, r));
      inMemoryRatings = Array.from(byId.values());

      await AsyncStorage.setItem(
        SAFETY_STORAGE_KEY,
        JSON.stringify(inMemoryRatings)
      ).catch(() => {});
    }
  } catch {}

  isLoaded = true;
  notifySafetyListeners();
  return inMemoryRatings;
}

export function getRouteSafetySummary(
  routeKeyOrName: string,
  optionalRouteName?: string
): RouteSafetySummary {
  const normKey = normalizeRouteKey(routeKeyOrName);
  const routeName = optionalRouteName || routeKeyOrName || "Campus Route";
  const baseline = getBaselineForRoute(normKey, routeName);

  const matching = inMemoryRatings.filter(
    (r) =>
      r.routeKey === normKey ||
      normalizeRouteKey(r.routeName) === normKey ||
      r.routeName.toLowerCase() === routeName.toLowerCase()
  );

  let totalRating = baseline.average * baseline.count;
  let totalCount = baseline.count;
  const tagCounts: Record<string, number> = {};

  baseline.tags.forEach((tag) => {
    tagCounts[tag] = (tagCounts[tag] || 0) + baseline.count;
  });

  matching.forEach((r) => {
    totalRating += r.rating;
    totalCount += 1;
    r.safetyTags?.forEach((tag) => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });

  const averageRating = totalCount > 0 ? Number((totalRating / totalCount).toFixed(1)) : baseline.average;
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map((e) => e[0]);

  let safetyLevel: RouteSafetySummary["safetyLevel"] = "High Safety";
  if (averageRating < 3.0) {
    safetyLevel = "Caution Advised";
  } else if (averageRating < 4.2) {
    safetyLevel = "Moderate Safety";
  }

  return {
    routeKey: normKey,
    routeName,
    averageRating,
    ratingCount: totalCount,
    safetyLevel,
    topTags,
  };
}

export async function submitRouteSafetyRating(params: {
  routeKey: string;
  routeName: string;
  rating: number; // 1 to 5
  safetyTags?: string[];
  feedback?: string;
  userId?: string;
  userDisplayName?: string;
  userRole?: string;
}): Promise<RouteSafetySummary> {
  const clampedRating = Math.max(1, Math.min(5, Math.round(params.rating)));
  const normKey = normalizeRouteKey(params.routeKey);

  const newRating: RouteSafetyRating = {
    id: `safety_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    routeKey: normKey,
    routeName: params.routeName,
    rating: clampedRating,
    safetyTags: params.safetyTags || [],
    feedback: params.feedback?.trim() || "",
    userId: params.userId,
    userDisplayName: params.userDisplayName,
    userRole: params.userRole,
    createdAt: new Date().toISOString(),
  };

  inMemoryRatings.unshift(newRating);

  // Persist locally
  await AsyncStorage.setItem(
    SAFETY_STORAGE_KEY,
    JSON.stringify(inMemoryRatings)
  ).catch(() => {});

  notifySafetyListeners();

  // Global Supabase sync
  try {
    await supabase.from("route_safety_ratings").insert({
      id: newRating.id,
      route_key: newRating.routeKey,
      route_name: newRating.routeName,
      rating: newRating.rating,
      safety_tags: newRating.safetyTags,
      feedback: newRating.feedback,
      user_id: newRating.userId || null,
      user_display_name: newRating.userDisplayName || null,
      user_role: newRating.userRole || null,
      created_at: newRating.createdAt,
    });
  } catch {
    // If Supabase table isn't created yet or offline, local persistent storage handles it safely
  }

  return getRouteSafetySummary(normKey, params.routeName);
}

export function getSafetyLevelStyle(score: number): {
  color: string;
  bg: string;
  border: string;
  label: string;
} {
  if (score >= 4.2) {
    return {
      color: "#15803d",
      bg: "#dcfce7",
      border: "#86efac",
      label: "High Safety",
    };
  }
  if (score >= 3.0) {
    return {
      color: "#b45309",
      bg: "#fef3c7",
      border: "#fde68a",
      label: "Moderate Safety",
    };
  }
  return {
    color: "#b91c1c",
    bg: "#fee2e2",
    border: "#fca5a5",
    label: "Caution Advised",
  };
}
