import { useAuth } from "@/contexts/AuthContext";
import type { DisplayRoutePlan } from "@/lib/transitPlanOptions";
import { normalizeTravelFare } from "@/lib/transitRoutes";
import {
  bookmarksEqual,
  loadBookmarks,
  loadRecentTrips,
  makeBookmarkKey,
  mergeRecentTrips,
  persistBookmarks,
  persistRecentTrips,
  type RecentTrip,
  type SavedRouteBookmark,
} from "@/lib/travelStorage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type TravelMeta = {
  originLabel: string;
  destinationLabel: string;
};

type TravelContextValue = {
  ready: boolean;
  bookmarks: SavedRouteBookmark[];
  recentTrips: RecentTrip[];
  refreshRecentTrips: () => Promise<void>;
  refreshTravelData: () => Promise<void>;
  isBookmarked: (plan: DisplayRoutePlan, meta: TravelMeta) => boolean;
  toggleBookmark: (plan: DisplayRoutePlan, meta: TravelMeta) => Promise<void>;
  removeBookmark: (key: string) => Promise<void>;
  addRecentFromTrip: (plan: DisplayRoutePlan, meta: TravelMeta) => Promise<void>;
  removeRecent: (key: string) => Promise<void> | void;
};

const TravelContext = createContext<TravelContextValue | null>(null);

export function TravelProvider({ children }: { children: ReactNode }) {
  const { session, isGuest } = useAuth();
  const userId = isGuest ? null : (session?.user?.id ?? null);

  const [ready, setReady] = useState(false);
  const [bookmarks, setBookmarks] = useState<SavedRouteBookmark[]>([]);
  const [recentTrips, setRecentTrips] = useState<RecentTrip[]>([]);
  const recentTripsRef = useRef<RecentTrip[]>([]);

  const refreshTravelData = useCallback(async () => {
    if (isGuest) {
      setBookmarks([]);
      setRecentTrips([]);
      recentTripsRef.current = [];
      return;
    }
    try {
      const [b, r] = await Promise.all([
        loadBookmarks(userId),
        loadRecentTrips(userId),
      ]);
      setBookmarks(bookmarksEqual(b));
      recentTripsRef.current = r;
      setRecentTrips(r);
    } catch {
      // Silently ignore travel data refresh errors
    }
  }, [userId, isGuest]);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setBookmarks([]);
    setRecentTrips([]);
    recentTripsRef.current = [];

    if (isGuest) {
      setReady(true);
      return;
    }

    (async () => {
      try {
        const [b, r] = await Promise.all([
          loadBookmarks(userId),
          loadRecentTrips(userId),
        ]);
        if (cancelled) return;
        setBookmarks(bookmarksEqual(b));
        setRecentTrips(r);
        recentTripsRef.current = r;
      } catch {
        // Silently ignore travel data load errors
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, isGuest]);

  const isBookmarked = useCallback(
    (plan: DisplayRoutePlan, meta: TravelMeta): boolean => {
      const key = makeBookmarkKey(
        plan.id,
        meta.originLabel,
        meta.destinationLabel
      );
      return bookmarks.some((x) => x.key === key);
    },
    [bookmarks]
  );

  const toggleBookmark = useCallback(
    async (plan: DisplayRoutePlan, meta: TravelMeta) => {
      if (isGuest) return;
      const key = makeBookmarkKey(
        plan.id,
        meta.originLabel,
        meta.destinationLabel
      );
      const exists = bookmarks.some((x) => x.key === key);
      const normalizedFare = normalizeTravelFare({
        routeName: plan.routeName,
        originLabel: meta.originLabel,
        destinationLabel: meta.destinationLabel,
        boardStop: plan.boardStop,
        offStop: plan.offStop,
        fareText: plan.fareText,
        fareValue: plan.fareValue,
        segments: plan.segments,
        polyline: plan.polyline,
        vehicleType: plan.vehicleType,
      });
      const next =
        exists
          ? bookmarks.filter((x) => x.key !== key)
          : [
              ...bookmarks,
              {
                key,
                originLabel: meta.originLabel,
                destinationLabel: meta.destinationLabel,
                routeName: plan.routeName,
                boardStop: plan.boardStop,
                offStop: plan.offStop,
                estimatedText: plan.estimatedText,
                fareText: normalizedFare.fareText,
                fareValue: normalizedFare.fareValue,
                segments: plan.segments,
                polyline: plan.polyline,
                savedAt: new Date().toISOString(),
              } satisfies SavedRouteBookmark,
            ];
      const deduped = bookmarksEqual(next);
      setBookmarks(deduped);
      await persistBookmarks(deduped, userId);
    },
    [bookmarks, userId, isGuest]
  );

  const removeBookmark = useCallback(
    async (key: string) => {
      if (isGuest) return;
      setBookmarks((prev) => {
        const next = prev.filter((x) => x.key !== key);
        void persistBookmarks(next, userId);
        return next;
      });
    },
    [userId, isGuest]
  );

  const addRecentFromTrip = useCallback(
    async (plan: DisplayRoutePlan, meta: TravelMeta) => {
      if (isGuest) return;
      const startedAt = new Date().toISOString();
      const normalizedFare = normalizeTravelFare({
        routeName: plan.routeName,
        originLabel: meta.originLabel,
        destinationLabel: meta.destinationLabel,
        boardStop: plan.boardStop,
        offStop: plan.offStop,
        fareText: plan.fareText,
        fareValue: plan.fareValue,
        segments: plan.segments,
        polyline: plan.polyline,
        vehicleType: plan.vehicleType,
      });
      const item: RecentTrip = {
        key: `${makeBookmarkKey(plan.id, meta.originLabel, meta.destinationLabel)}|${startedAt}`,
        planId: plan.id,
        originLabel: meta.originLabel || "Current Location",
        destinationLabel: meta.destinationLabel || "De La Salle Araneta University",
        etaText: plan.estimatedText,
        routeName: plan.routeName,
        boardStop: plan.boardStop,
        offStop: plan.offStop,
        fareText: normalizedFare.fareText,
        fareValue: normalizedFare.fareValue,
        segments: plan.segments,
        polyline: plan.polyline,
        startedAt,
      };

      const baseList =
        recentTripsRef.current.length > 0
          ? recentTripsRef.current
          : await loadRecentTrips(userId);

      const next = mergeRecentTrips(baseList, item);
      recentTripsRef.current = next;
      setRecentTrips(next);
      await persistRecentTrips(next, userId);
    },
    [userId, isGuest]
  );

  const removeRecent = useCallback(
    async (key: string) => {
      if (isGuest) return;
      const baseList =
        recentTripsRef.current.length > 0
          ? recentTripsRef.current
          : await loadRecentTrips(userId);
      const next = baseList.filter((x) => x.key !== key);
      recentTripsRef.current = next;
      setRecentTrips(next);
      await persistRecentTrips(next, userId);
    },
    [userId, isGuest]
  );

  const value = useMemo(
    () => ({
      ready,
      bookmarks,
      recentTrips,
      refreshRecentTrips: refreshTravelData,
      refreshTravelData,
      isBookmarked,
      toggleBookmark,
      removeBookmark,
      addRecentFromTrip,
      removeRecent,
    }),
    [
      ready,
      bookmarks,
      recentTrips,
      refreshTravelData,
      isBookmarked,
      toggleBookmark,
      removeBookmark,
      addRecentFromTrip,
      removeRecent,
    ]
  );

  return (
    <TravelContext.Provider value={value}>{children}</TravelContext.Provider>
  );
}

export function useTravel() {
  const ctx = useContext(TravelContext);
  if (!ctx) {
    throw new Error("useTravel must be used within TravelProvider");
  }
  return ctx;
}
