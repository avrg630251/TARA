import { kvGet, kvSet } from "@/lib/kvStorage";

const BOOKMARKS_KEY = "tara:bookmarks";
const RECENT_KEY = "tara:recentTrips";

const MAX_BOOKMARKS = 50;
const MAX_RECENT = 15;

export type SavedRouteBookmark = {
  key: string;
  originLabel: string;
  destinationLabel: string;
  routeName: string;
  boardStop: string;
  offStop: string;
  estimatedText: string;
  fareText: string;
  savedAt: string;
};

export type RecentTrip = {
  key: string;
  originLabel: string;
  destinationLabel: string;
  etaText: string;
  routeName: string;
  boardStop: string;
  offStop: string;
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

export async function loadBookmarks(): Promise<SavedRouteBookmark[]> {
  const raw = await kvGet(BOOKMARKS_KEY);
  const list = parseJson<SavedRouteBookmark[]>(raw, []);
  return Array.isArray(list) ? list.slice(0, MAX_BOOKMARKS) : [];
}

export async function persistBookmarks(list: SavedRouteBookmark[]): Promise<void> {
  await kvSet(BOOKMARKS_KEY, JSON.stringify(list.slice(0, MAX_BOOKMARKS)));
}

export async function loadRecentTrips(): Promise<RecentTrip[]> {
  const raw = await kvGet(RECENT_KEY);
  const list = parseJson<RecentTrip[]>(raw, []);
  return Array.isArray(list) ? list.slice(0, MAX_RECENT) : [];
}

export async function persistRecentTrips(list: RecentTrip[]): Promise<void> {
  await kvSet(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
}

/** Keep newest-first; dedupe same origin + destination labels. */
export function mergeRecentTrips(existing: RecentTrip[], next: RecentTrip): RecentTrip[] {
  const pair = `${strip(next.originLabel)}::${strip(next.destinationLabel)}`;
  const filtered = existing.filter((t) => {
    const p = `${strip(t.originLabel)}::${strip(t.destinationLabel)}`;
    return p !== pair;
  });
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
