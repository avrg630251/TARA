import type { DisplayRoutePlan } from "@/lib/transitPlanOptions";
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
  isBookmarked: (plan: DisplayRoutePlan, meta: TravelMeta) => boolean;
  toggleBookmark: (plan: DisplayRoutePlan, meta: TravelMeta) => Promise<void>;
  removeBookmark: (key: string) => void;
  addRecentFromTrip: (plan: DisplayRoutePlan, meta: TravelMeta) => void;
  removeRecent: (key: string) => void;
};

const TravelContext = createContext<TravelContextValue | null>(null);

export function TravelProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [bookmarks, setBookmarks] = useState<SavedRouteBookmark[]>([]);
  const [recentTrips, setRecentTrips] = useState<RecentTrip[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [b, r] = await Promise.all([loadBookmarks(), loadRecentTrips()]);
      if (cancelled) return;
      setBookmarks(bookmarksEqual(b));
      setRecentTrips(r);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      const key = makeBookmarkKey(
        plan.id,
        meta.originLabel,
        meta.destinationLabel
      );
      const exists = bookmarks.some((x) => x.key === key);
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
                fareText: plan.fareText,
                polyline: plan.polyline,
                savedAt: new Date().toISOString(),
              } satisfies SavedRouteBookmark,
            ];
      const deduped = bookmarksEqual(next);
      setBookmarks(deduped);
      await persistBookmarks(deduped);
    },
    [bookmarks]
  );

  const removeBookmark = useCallback(async (key: string) => {
    setBookmarks((prev) => {
      const next = prev.filter((x) => x.key !== key);
      void persistBookmarks(next);
      return next;
    });
  }, []);

  const addRecentFromTrip = useCallback(
    async (plan: DisplayRoutePlan, meta: TravelMeta) => {
      const startedAt = new Date().toISOString();
      const item: RecentTrip = {
        key: `${makeBookmarkKey(plan.id, meta.originLabel, meta.destinationLabel)}|${startedAt}`,
        originLabel: meta.originLabel,
        destinationLabel: meta.destinationLabel,
        etaText: plan.estimatedText,
        routeName: plan.routeName,
        boardStop: plan.boardStop,
        offStop: plan.offStop,
        startedAt,
      };
      setRecentTrips((prev) => {
        const next = mergeRecentTrips(prev, item);
        void persistRecentTrips(next);
        return next;
      });
    },
    []
  );

  const removeRecent = useCallback((key: string) => {
    setRecentTrips((prev) => {
      const next = prev.filter((x) => x.key !== key);
      void persistRecentTrips(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      ready,
      bookmarks,
      recentTrips,
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
