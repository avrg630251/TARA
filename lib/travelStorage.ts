import { kvGet, kvSet } from "@/lib/kvStorage";
import type { LatLng } from "@/lib/googleMapsRoutes";
import type { DisplayRouteSegment } from "@/lib/transitPlanOptions";
import { normalizeTravelFare } from "@/lib/transitRoutes";

export function getBookmarksKey(userId?: string | null): string {
  return userId ? `tara:${userId}:bookmarks` : "tara:guest:bookmarks";
}

export function getRecentTripsKey(userId?: string | null): string {
  return userId ? `tara:${userId}:recentTrips` : "tara:guest:recentTrips";
}

const MAX_BOOKMARKS = 50;
const MAX_RECENT = 20;

export type SavedRouteBookmark = {
  key: string;
  originLabel: string;
  destinationLabel: string;
  routeName: string;
  boardStop: string;
  offStop: string;
  estimatedText: string;
  fareText: string;
  fareValue?: number | null;
  segments?: DisplayRouteSegment[];
  polyline?: LatLng[];
  savedAt: string;
};

export type RecentTrip = {
  key: string;
  planId?: string;
  originLabel: string;
  destinationLabel: string;
  etaText: string;
  routeName: string;
  boardStop: string;
  offStop: string;
  fareValue?: number | null;
  fareText?: string;
  segments?: DisplayRouteSegment[];
  polyline?: LatLng[];
  startedAt: string;
};

function strip(s: string): string {
  return s.trim().toLowerCase();
}

export function makeBookmarkKey(
  planId: string,
  originLabel: string,
  destinationLabel: string
): string {
  return `${planId}|${strip(originLabel)}|${strip(destinationLabel)}`;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function loadBookmarks(userId?: string | null): Promise<SavedRouteBookmark[]> {
  const key = getBookmarksKey(userId);
  const raw = await kvGet(key);
  const list = parseJson<SavedRouteBookmark[]>(raw, []);
  if (!Array.isArray(list)) return [];
  const normalized = list.slice(0, MAX_BOOKMARKS).map((b) => {
    const f = normalizeTravelFare({
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
      ...b,
      fareText: f.fareText,
      fareValue: f.fareValue,
    };
  });
  const hasChanges = list.some(
    (b, i) =>
      normalized[i] &&
      (b.fareText !== normalized[i].fareText || b.fareValue !== normalized[i].fareValue)
  );
  if (hasChanges) {
    void kvSet(key, JSON.stringify(normalized));
  }
  return normalized;
}

export async function persistBookmarks(
  list: SavedRouteBookmark[],
  userId?: string | null
): Promise<void> {
  const key = getBookmarksKey(userId);
  await kvSet(key, JSON.stringify(list.slice(0, MAX_BOOKMARKS)));
}

/** Generates a signature identifying the specific route and stops to prevent repeating duplicate trips. */
export function getTripSignature(t: RecentTrip): string {
  const planId = t.planId || (t.key ? t.key.split("|")[0]?.trim().toLowerCase() : "");
  const route = strip(t.routeName || "");
  const board = strip(t.boardStop || "");
  const off = strip(t.offStop || "");
  const origin = strip(t.originLabel || "");
  const dest = strip(t.destinationLabel || "");

  const segmentSig = (t.segments || [])
    .map((s) => s.segmentId || s.routeId || s.label)
    .filter(Boolean)
    .join(">");

  if (segmentSig) {
    return `seg:${segmentSig}|board:${board}|off:${off}`;
  }

  if (planId && planId !== "plan" && planId !== "undefined") {
    return `plan:${planId}|board:${board}|off:${off}`;
  }

  if (route && (board || off)) {
    return `route:${route}|board:${board}|off:${off}`;
  }

  if (route) {
    return `route:${route}|origin:${origin}|dest:${dest}`;
  }

  return `origin:${origin}|dest:${dest}|board:${board}|off:${off}`;
}

export function dedupeRecentTrips(trips: RecentTrip[]): RecentTrip[] {
  const seen = new Set<string>();
  const out: RecentTrip[] = [];
  for (const t of trips) {
    const sig = getTripSignature(t);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(t);
  }
  return out.slice(0, MAX_RECENT);
}

export async function loadRecentTrips(userId?: string | null): Promise<RecentTrip[]> {
  const key = getRecentTripsKey(userId);
  const raw = await kvGet(key);
  const list = parseJson<RecentTrip[]>(raw, []);
  if (!Array.isArray(list)) return [];
  const normalized = list.map((t) => {
    const f = normalizeTravelFare({
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
      ...t,
      fareText: f.fareText,
      fareValue: f.fareValue,
    };
  });
  const deduped = dedupeRecentTrips(normalized);
  const hasChanges =
    deduped.length !== list.length ||
    list.some(
      (t, i) =>
        deduped[i] &&
        (t.fareText !== deduped[i].fareText || t.fareValue !== deduped[i].fareValue)
    );
  if (hasChanges) {
    void kvSet(key, JSON.stringify(deduped));
  }
  return deduped;
}

export async function persistRecentTrips(
  list: RecentTrip[],
  userId?: string | null
): Promise<void> {
  const key = getRecentTripsKey(userId);
  const deduped = dedupeRecentTrips(list);
  await kvSet(key, JSON.stringify(deduped.slice(0, MAX_RECENT)));
}

/** Keep newest-first; dedupe repeating trips sharing the same route signature. */
export function mergeRecentTrips(existing: RecentTrip[], next: RecentTrip): RecentTrip[] {
  const nextSig = getTripSignature(next);
  const filtered = existing.filter((t) => getTripSignature(t) !== nextSig);
  return [next, ...filtered].slice(0, MAX_RECENT);
}

export function bookmarksEqual(a: SavedRouteBookmark[]): SavedRouteBookmark[] {
  const seen = new Set<string>();
  const out: SavedRouteBookmark[] = [];
  for (const b of a) {
    if (seen.has(b.key)) continue;
    seen.add(b.key);
    out.push(b);
  }
  return out.slice(0, MAX_BOOKMARKS);
}
