import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { FullScreenMap } from "@/components/FullScreenMap";
import { useTravel } from "@/contexts/TravelContext";
import {
  fetchTransitItinerariesFromGoogle,
  geocodeAddress,
  getPlaceSuggestions,
  getRouteBetween,
  type LatLng,
  type PlaceSuggestion,
} from "@/lib/googleMapsRoutes";
import {
  type ClassScheduleItem,
  loadClassSchedules,
  sortRoutesForSchedule,
} from "@/lib/classSchedules";
import {
  composeTransitPlanOptions,
  type DisplayRoutePlan,
} from "@/lib/transitPlanOptions";
import { type RouteFilter } from "@/lib/mockTransitRoutes";
import {
  computeFlatFareForTrip,
  fetchGtfsRoutesBetweenPoints,
  fetchGtfsRoutesByShape,
  type DiscountCode,
  type TransitRouteRecord,
} from "@/lib/transitRoutes";

const GREEN = "#1B4332";
const FALLBACK_LAT = 14.5995;
const FALLBACK_LNG = 120.9842;
const DEFAULT_RADIUS_METERS = 1000;
const DB_MATCH_POOL_LIMIT = 20;
type ActiveInput = "origin" | "destination" | null;

function isDefaultOriginLabel(label: string) {
  const t = label.trim().toLowerCase();
  return t === "your location" || t === "current location";
}

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatCurrency(amount: number, currency: string) {
  if (currency.toUpperCase() === "PHP") return `Php ${amount.toFixed(2)}`;
  return `${currency} ${amount.toFixed(2)}`;
}

function pickSearchParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

export default function SearchMapScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ origin?: string; destination?: string }>();
  const { isBookmarked, toggleBookmark, addRecentFromTrip } = useTravel();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const expandedSheetHeight = Math.min(
    Math.max(windowHeight * 0.72, 430),
    windowHeight * 0.84
  );
  const collapsedSheetHeight = Math.min(
    Math.max(windowHeight * 0.26, 220),
    windowHeight * 0.42
  );
  const maxSheetTranslateY = Math.max(0, expandedSheetHeight - collapsedSheetHeight);
  const sheetTranslateY = useRef(new Animated.Value(maxSheetTranslateY)).current;
  const sheetOffsetRef = useRef(maxSheetTranslateY);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [originLabel, setOriginLabel] = useState("Your location");
  const [destination, setDestination] = useState("De La Salle Araneta University");
  const [activeInput, setActiveInput] = useState<ActiveInput>(null);
  const [originSuggestions, setOriginSuggestions] = useState<PlaceSuggestion[]>([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState<
    PlaceSuggestion[]
  >([]);
  const [originSuggestLoading, setOriginSuggestLoading] = useState(false);
  const [destinationSuggestLoading, setDestinationSuggestLoading] = useState(false);
  const [originSuggestError, setOriginSuggestError] = useState<string | null>(null);
  const [destinationSuggestError, setDestinationSuggestError] = useState<string | null>(
    null
  );
  const [filter, setFilter] = useState<RouteFilter>("all");
  const [latitude, setLatitude] = useState(FALLBACK_LAT);
  const [longitude, setLongitude] = useState(FALLBACK_LNG);
  const [routePlans, setRoutePlans] = useState<DisplayRoutePlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [fitMapSignal, setFitMapSignal] = useState(0);
  const [destinationCoord, setDestinationCoord] = useState<LatLng | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [radiusMeters, setRadiusMeters] = useState(DEFAULT_RADIUS_METERS);
  const [discountCode, setDiscountCode] = useState<DiscountCode>("regular");
  const [routeLoading, setRouteLoading] = useState(false);
  const [hasRouteSearch, setHasRouteSearch] = useState(false);
  const [classSchedules, setClassSchedules] = useState<ClassScheduleItem[]>([]);
  const [tripActivePlan, setTripActivePlan] = useState<DisplayRoutePlan | null>(
    null
  );
  const [navLatitude, setNavLatitude] = useState(latitude);
  const [navLongitude, setNavLongitude] = useState(longitude);
  const tripWatchRef = useRef<(() => void) | null>(null);

  const stopTripWatch = useCallback(() => {
    if (!tripWatchRef.current) return;
    try {
      tripWatchRef.current();
    } catch {
      // Some web expo-location versions throw during remove; swallow and continue.
    } finally {
      tripWatchRef.current = null;
    }
  }, []);

  useEffect(() => {
    const dest = pickSearchParam(params.destination);
    const orig = pickSearchParam(params.origin);
    if (!dest && !orig) return;
    if (orig) setOriginLabel(orig);
    if (dest) setDestination(dest);
    router.setParams({ origin: undefined, destination: undefined });

    const hasDefinedRoute = Boolean(orig || dest);
    if (hasDefinedRoute) {
      const timer = setTimeout(() => {
        void buildRoute();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [params.destination, params.origin, router]);

  useEffect(() => {
    let cancelled = false;
    void loadClassSchedules().then((items) => {
      if (!cancelled) setClassSchedules(items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const fitEdgePadding = useMemo(
    () => ({
      top: insets.top + 200,
      right: 20,
      bottom: Math.min(insets.bottom + windowHeight * 0.32, windowHeight * 0.42),
      left: 20,
    }),
    [insets.top, insets.bottom, windowHeight]
  );

  useEffect(() => {
    const targetOffset = sheetExpanded ? 0 : maxSheetTranslateY;
    sheetOffsetRef.current = targetOffset;
    sheetTranslateY.setValue(targetOffset);
  }, [maxSheetTranslateY, sheetExpanded, sheetTranslateY]);

  const snapSheet = useCallback(
    (expand: boolean) => {
      const target = expand ? 0 : maxSheetTranslateY;
      sheetOffsetRef.current = target;
      setSheetExpanded(expand);
      Animated.spring(sheetTranslateY, {
        toValue: target,
        useNativeDriver: true,
        bounciness: 0,
      }).start();
    },
    [maxSheetTranslateY, sheetTranslateY]
  );

  const sheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dy) > 4 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderMove: (_, gestureState) => {
          const next = Math.min(
            maxSheetTranslateY,
            Math.max(0, sheetOffsetRef.current + gestureState.dy)
          );
          sheetTranslateY.setValue(next);
        },
        onPanResponderRelease: (_, gestureState) => {
          const next = Math.min(
            maxSheetTranslateY,
            Math.max(0, sheetOffsetRef.current + gestureState.dy)
          );
          const velocityUp = gestureState.vy < -0.25;
          const velocityDown = gestureState.vy > 0.25;
          if (velocityUp) {
            snapSheet(true);
            return;
          }
          if (velocityDown) {
            snapSheet(false);
            return;
          }
          snapSheet(next < maxSheetTranslateY / 2);
        },
      }),
    [maxSheetTranslateY, sheetTranslateY, snapSheet]
  );

  const clearRoute = useCallback(() => {
    stopTripWatch();
    setTripActivePlan(null);
    setRoutePlans([]);
    setSelectedPlanId(null);
    setDestinationCoord(null);
    setRouteError(null);
  }, [stopTripWatch]);

  useEffect(() => {
    if (activeInput !== "origin") return;
    if (isDefaultOriginLabel(originLabel) || originLabel.trim().length < 2) {
      setOriginSuggestions([]);
      setOriginSuggestError(null);
      return;
    }

    let cancelled = false;
    setOriginSuggestLoading(true);
    const timer = setTimeout(async () => {
      try {
        const list = await getPlaceSuggestions(originLabel, {
          limit: 3,
          locationBias: { lat: latitude, lng: longitude },
        });
        if (!cancelled) {
          setOriginSuggestions(list);
          setOriginSuggestError(null);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setOriginSuggestions([]);
          setOriginSuggestError(
            e instanceof Error ? e.message : "Could not load suggestions."
          );
        }
      } finally {
        if (!cancelled) setOriginSuggestLoading(false);
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeInput, originLabel, latitude, longitude]);

  useEffect(() => {
    if (activeInput !== "destination") return;
    if (destination.trim().length < 2) {
      setDestinationSuggestions([]);
      setDestinationSuggestError(null);
      return;
    }

    let cancelled = false;
    setDestinationSuggestLoading(true);
    const timer = setTimeout(async () => {
      try {
        const list = await getPlaceSuggestions(destination, {
          limit: 3,
          locationBias: { lat: latitude, lng: longitude },
        });
        if (!cancelled) {
          setDestinationSuggestions(list);
          setDestinationSuggestError(null);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setDestinationSuggestions([]);
          setDestinationSuggestError(
            e instanceof Error ? e.message : "Could not load suggestions."
          );
        }
      } finally {
        if (!cancelled) setDestinationSuggestLoading(false);
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeInput, destination, latitude, longitude]);

  const routes = useMemo<DisplayRoutePlan[]>(() => {
    const withFares = routePlans.map((p) => {
      const fare = computeFlatFareForTrip({
        transferCount: p.transferCount,
        discountCode,
        logicalRouteKey: p.dbRouteId ?? p.id,
      });
      return {
        ...p,
        fareText: formatCurrency(fare.finalFare, fare.currency),
        fareValue: fare.finalFare,
      };
    });

    let ordered: DisplayRoutePlan[];

    if (filter === "fastest") {
      ordered = [...withFares].sort((a, b) => {
        const aEta = a.etaMinutes ?? Number.POSITIVE_INFINITY;
        const bEta = b.etaMinutes ?? Number.POSITIVE_INFINITY;
        return aEta - bEta;
      });
    } else if (filter === "cheapest") {
      ordered = [...withFares].sort((a, b) => {
        const aFare = a.fareValue ?? Number.POSITIVE_INFINITY;
        const bFare = b.fareValue ?? Number.POSITIVE_INFINITY;
        if (aFare !== bFare) return aFare - bFare;
        const aScore = a.generalizedCost ?? Number.POSITIVE_INFINITY;
        const bScore = b.generalizedCost ?? Number.POSITIVE_INFINITY;
        return aScore - bScore;
      });
    } else {
      ordered = [...withFares].sort((a, b) => {
        const aScore = a.generalizedCost ?? Number.POSITIVE_INFINITY;
        const bScore = b.generalizedCost ?? Number.POSITIVE_INFINITY;
        return aScore - bScore;
      });
    }

    if (classSchedules.length > 0) {
      ordered = sortRoutesForSchedule(ordered, classSchedules);
    }

    return ordered;
  }, [routePlans, discountCode, filter, classSchedules]);

  const routeAlternativesForMap = useMemo(() => {
    if (!routes.some((r) => r.polyline.length > 1)) return undefined;
    const primaryId = selectedPlanId ?? routes[0]?.id ?? null;
    const last = routes.filter((r) => r.id === primaryId);
    const rest = routes.filter((r) => r.id !== primaryId);
    return [...rest, ...last].map((r) => ({
      coordinates: r.polyline,
      selected: primaryId != null ? r.id === primaryId : false,
    }));
  }, [routes, selectedPlanId]);

  const distanceToDestinationMeters = useMemo(() => {
    if (!tripActivePlan || !destinationCoord) return null;
    return haversineMeters(
      { lat: navLatitude, lng: navLongitude },
      {
        lat: destinationCoord.latitude,
        lng: destinationCoord.longitude,
      }
    );
  }, [tripActivePlan, destinationCoord, navLatitude, navLongitude]);

  const endTrip = useCallback(() => {
    stopTripWatch();
    setTripActivePlan(null);
  }, [stopTripWatch]);

  const startTrip = useCallback(
    async (plan: DisplayRoutePlan) => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location required",
          "Allow location access to follow your trip on the map in real time."
        );
        return;
      }
      setSelectedPlanId(plan.id);
      setTripActivePlan(plan);
      setNavLatitude(latitude);
      setNavLongitude(longitude);
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        setNavLatitude(pos.coords.latitude);
        setNavLongitude(pos.coords.longitude);
      } catch {
        /* use last known */
      }
      void addRecentFromTrip(plan, {
        originLabel,
        destinationLabel: destination.trim(),
      });
      snapSheet(false);
    },
    [latitude, longitude, snapSheet, destination, originLabel, addRecentFromTrip]
  );

  useEffect(() => {
    if (!tripActivePlan) {
      stopTripWatch();
      return;
    }

    let cancelled = false;

    (async () => {
      if (
        Platform.OS === "web" &&
        typeof navigator !== "undefined" &&
        navigator.geolocation
      ) {
        const watchId = navigator.geolocation.watchPosition(
          (pos) => {
            if (cancelled) return;
            setNavLatitude(pos.coords.latitude);
            setNavLongitude(pos.coords.longitude);
          },
          () => {
            // Keep last known location if watcher fails.
          },
          { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
        );
        if (cancelled) {
          navigator.geolocation.clearWatch(watchId);
          return;
        }
        stopTripWatch();
        tripWatchRef.current = () => navigator.geolocation.clearWatch(watchId);
        return;
      }

      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 2000,
          distanceInterval: 12,
        },
        (loc) => {
          if (cancelled) return;
          setNavLatitude(loc.coords.latitude);
          setNavLongitude(loc.coords.longitude);
        }
      );
      if (cancelled) {
        try {
          sub.remove();
        } catch {
          // ignore
        }
        return;
      }
      stopTripWatch();
      tripWatchRef.current = () => {
        try {
          sub.remove();
        } catch {
          // ignore
        }
      };
    })();

    return () => {
      cancelled = true;
      stopTripWatch();
    };
  }, [tripActivePlan?.id, stopTripWatch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled || status !== "granted") return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setLatitude(pos.coords.latitude);
          setLongitude(pos.coords.longitude);
        }
      } catch {
        /* keep fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function swapEndpoints() {
    clearRoute();
    setOriginSuggestions([]);
    setDestinationSuggestions([]);
    setOriginSuggestError(null);
    setDestinationSuggestError(null);
    const nextDest = destination;
    const nextOrigin = originLabel;
    const isDefaultOrigin = isDefaultOriginLabel(nextOrigin);
    setDestination(isDefaultOrigin ? "" : nextOrigin);
    setOriginLabel(nextDest.trim() === "" ? "Your location" : nextDest);
  }

  function chooseOriginSuggestion(item: PlaceSuggestion) {
    setOriginLabel(item.description);
    setOriginSuggestions([]);
    setOriginSuggestError(null);
    setActiveInput(null);
    clearRoute();
  }

  function chooseDestinationSuggestion(item: PlaceSuggestion) {
    setDestination(item.description);
    setDestinationSuggestions([]);
    setDestinationSuggestError(null);
    setActiveInput(null);
    clearRoute();
  }

  async function buildRoute() {
    setHasRouteSearch(true);
    setRouteLoading(true);
    setRouteError(null);
    setActiveInput(null);
    setOriginSuggestions([]);
    setDestinationSuggestions([]);
    setOriginSuggestError(null);
    setDestinationSuggestError(null);
    setRoutePlans([]);
    setSelectedPlanId(null);
    try {
      const destQuery = destination.trim();
      if (!destQuery) {
        throw new Error("Enter a destination (address or place name).");
      }

      const useGpsOrigin = isDefaultOriginLabel(originLabel);
      const originGeo = useGpsOrigin
        ? { lat: latitude, lng: longitude }
        : await geocodeAddress(originLabel);

      const destGeo = await geocodeAddress(destQuery);
      setDestinationCoord({
        latitude: destGeo.lat,
        longitude: destGeo.lng,
      });

      const googleItins = await fetchTransitItinerariesFromGoogle(
        originGeo,
        destGeo
      );

      let overview: {
        coordinates: LatLng[];
        mode: string;
        summary: string;
      } | null = null;

      if (googleItins.length === 0) {
        const r = await getRouteBetween(originGeo, destGeo);
        overview = {
          coordinates: r.coordinates,
          mode: r.mode,
          summary: r.summary,
        };
      }

      const userToDestinationMeters = haversineMeters(originGeo, destGeo);

      const finalizePlansAndBounds = async (pool: TransitRouteRecord[]) => {
        const rankedPool = [...pool]
          .sort((a, b) => {
            const ca =
              a.generalized_cost_minutes ?? Number(a.eta_minutes ?? 99999);
            const cb =
              b.generalized_cost_minutes ?? Number(b.eta_minutes ?? 99999);
            return ca - cb;
          })
          .slice(0, DB_MATCH_POOL_LIMIT);

        let plans = composeTransitPlanOptions({
          itineraries: googleItins,
          dbRoutes: rankedPool,
          fallbackPolyline: overview?.coordinates,
          limit: 3,
        });

        if (
          plans.length === 0 &&
          overview &&
          overview.coordinates.length > 1
        ) {
          plans = [
            {
              id: "map-overview-fallback",
              routeName:
                overview.mode === "transit"
                  ? "Transit (overview)"
                  : "Driving fallback",
              transfersText: "—",
              estimatedText: "—",
              fareText: "—",
              boardStop: "—",
              offStop: "—",
              etaMinutes: null,
              fareValue: null,
              generalizedCost: null,
              transferCount: null,
              polyline: overview.coordinates,
              fromGoogle: true,
              googleSummary: overview.summary,
            },
          ];
        }

        setRoutePlans(plans);
        setSelectedPlanId(plans[0]?.id ?? null);
        setFitMapSignal((n) => n + 1);
      };

      if (userToDestinationMeters > radiusMeters) {
        await finalizePlansAndBounds([]);
        return;
      }

      const directMatches = await fetchGtfsRoutesBetweenPoints({
        originLat: originGeo.lat,
        originLng: originGeo.lng,
        destinationLat: destGeo.lat,
        destinationLng: destGeo.lng,
        stopRadiusMeters: 600,
      });
      const shapeMatches = await fetchGtfsRoutesByShape({
        originLat: originGeo.lat,
        originLng: originGeo.lng,
        destinationLat: destGeo.lat,
        destinationLng: destGeo.lng,
        shapeRadiusMeters: 700,
      });

      const shapeRouteIds = new Set(shapeMatches.map((r) => r.route_id));
      const overlapMatches = directMatches.filter((r) =>
        shapeRouteIds.has(r.route_id)
      );

      let fetched = overlapMatches;

      if (fetched.length === 0) {
        if (directMatches.length > 0) {
          fetched = directMatches;
        } else {
          fetched = shapeMatches;
        }
      }

      await finalizePlansAndBounds(fetched);
    } catch (e: unknown) {
      clearRoute();
      setRouteError(e instanceof Error ? e.message : "Could not load route.");
    } finally {
      setRouteLoading(false);
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar style={tripActivePlan ? "light" : "dark"} />

      <FullScreenMap
        latitude={tripActivePlan ? navLatitude : latitude}
        longitude={tripActivePlan ? navLongitude : longitude}
        polylineCoordinates={
          tripActivePlan
            ? tripActivePlan.polyline.length > 1
              ? tripActivePlan.polyline
              : undefined
            : routeAlternativesForMap?.length
              ? undefined
              : routes[0]?.polyline
        }
        routeAlternatives={
          tripActivePlan ? undefined : routeAlternativesForMap
        }
        destinationCoordinate={destinationCoord}
        destinationRadiusMeters={
          tripActivePlan ? undefined : destinationCoord ? radiusMeters : undefined
        }
        navigationMode={!!tripActivePlan}
        trackedCoordinate={
          tripActivePlan
            ? { latitude: navLatitude, longitude: navLongitude }
            : null
        }
        fitEdgePadding={fitEdgePadding}
        fitSignal={tripActivePlan ? 0 : fitMapSignal}
      />

      {tripActivePlan ? (
        <>
          <SafeAreaView style={styles.tripTopBar} edges={["top"]}>
            <Pressable
              onPress={endTrip}
              style={({ pressed }) => [
                styles.tripIconBtn,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="End trip"
              hitSlop={12}
            >
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
            <Text style={styles.tripTopTitle} numberOfLines={1}>
              Live navigation
            </Text>
            <View style={styles.tripTopSpacer} />
          </SafeAreaView>

          <SafeAreaView style={styles.tripHudOuter} edges={["bottom"]}>
            <View style={styles.tripHudCard}>
              <Text style={styles.tripHudRoute} numberOfLines={2}>
                {tripActivePlan.routeName}
              </Text>
              <Text style={styles.tripHudMeta}>
                {tripActivePlan.estimatedText} ·{" "}
                {tripActivePlan.transfersText} transfer(s) ·{" "}
                {tripActivePlan.fareText}
              </Text>
              <Text style={styles.tripHudStop} numberOfLines={2}>
                <Text style={styles.tripHudStopLabel}>Board: </Text>
                {tripActivePlan.boardStop}
              </Text>
              <Text style={styles.tripHudStop} numberOfLines={2}>
                <Text style={styles.tripHudStopLabel}>Get off: </Text>
                {tripActivePlan.offStop}
              </Text>
              {distanceToDestinationMeters != null ? (
                <Text style={styles.tripHudDistance}>
                  {distanceToDestinationMeters < 120
                    ? "You are near your destination area."
                    : `${formatDistance(distanceToDestinationMeters)} to destination pin`}
                </Text>
              ) : null}
              <Text style={styles.tripHudHint}>
                The map follows your position. The green line is your chosen
                transit path from the earlier search.
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.tripEndBtn,
                  pressed && styles.pressed,
                ]}
                onPress={endTrip}
                accessibilityRole="button"
                accessibilityLabel="End trip"
              >
                <Text style={styles.tripEndBtnText}>End trip</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </>
      ) : null}

      {!tripActivePlan ? (
      <SafeAreaView style={styles.topSafe} edges={["top"]}>
        <View style={styles.whereCard}>
          <View style={styles.whereHeader}>
            <Pressable
              onPress={() => router.navigate("/(main)")}
              hitSlop={12}
              style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Go to home"
            >
              <Ionicons name="arrow-back" size={22} color={GREEN} />
            </Pressable>
            <Text style={styles.whereTitle}>Where to?</Text>
            <View style={styles.headerSpacer} pointerEvents="none" />
          </View>

          <View style={styles.inputsBlock}>
            <View style={styles.inputsColumn}>
              <View style={styles.inputRowWrap}>
                <View style={styles.inputRow}>
                  <View style={styles.originDot}>
                    <View style={styles.originDotInner} />
                  </View>
                  <TextInput
                    style={styles.fieldInput}
                    value={originLabel}
                    onFocus={() => setActiveInput("origin")}
                    onBlur={() => {
                      setTimeout(
                        () =>
                          setActiveInput((prev) =>
                            prev === "origin" ? null : prev
                          ),
                        120
                      );
                    }}
                    onChangeText={(t) => {
                      setOriginLabel(t);
                      clearRoute();
                    }}
                    placeholder="Your location"
                    placeholderTextColor="#868e96"
                  />
                  {originSuggestLoading ? (
                    <ActivityIndicator size="small" color={GREEN} />
                  ) : null}
                </View>
                {activeInput === "origin" && originSuggestions.length > 0 ? (
                  <View style={styles.suggestionsBox}>
                    {originSuggestions.map((item) => (
                      <Pressable
                        key={item.placeId}
                        style={({ pressed }) => [
                          styles.suggestionItem,
                          pressed && styles.pressed,
                        ]}
                        onPress={() => chooseOriginSuggestion(item)}
                      >
                        <View style={styles.suggestionRow}>
                          <View style={styles.suggestionIconCircle}>
                            <Ionicons
                              name="location-outline"
                              size={14}
                              color="#495057"
                            />
                          </View>
                          <View style={styles.suggestionTexts}>
                            <Text numberOfLines={1} style={styles.suggestionMain}>
                              {item.mainText}
                            </Text>
                            {item.secondaryText ? (
                              <Text numberOfLines={1} style={styles.suggestionSub}>
                                {item.secondaryText}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {activeInput === "origin" && originSuggestError ? (
                  <Text style={styles.suggestErrorText}>{originSuggestError}</Text>
                ) : null}
              </View>
              <View style={styles.inputRowWrap}>
                <View style={styles.inputRow}>
                  <Ionicons name="location" size={20} color="#c92a2a" />
                  <TextInput
                    style={styles.fieldInput}
                    value={destination}
                    onFocus={() => setActiveInput("destination")}
                    onBlur={() => {
                      setTimeout(
                        () =>
                          setActiveInput((prev) =>
                            prev === "destination" ? null : prev
                          ),
                        120
                      );
                    }}
                    onChangeText={(t) => {
                      setDestination(t);
                      clearRoute();
                    }}
                    placeholder="Select destination"
                    placeholderTextColor="#868e96"
                  />
                  {destinationSuggestLoading ? (
                    <ActivityIndicator size="small" color={GREEN} />
                  ) : null}
                </View>
                {activeInput === "destination" &&
                destinationSuggestions.length > 0 ? (
                  <View style={styles.suggestionsBox}>
                    {destinationSuggestions.map((item) => (
                      <Pressable
                        key={item.placeId}
                        style={({ pressed }) => [
                          styles.suggestionItem,
                          pressed && styles.pressed,
                        ]}
                        onPress={() => chooseDestinationSuggestion(item)}
                      >
                        <View style={styles.suggestionRow}>
                          <View style={styles.suggestionIconCircle}>
                            <Ionicons
                              name="location-outline"
                              size={14}
                              color="#495057"
                            />
                          </View>
                          <View style={styles.suggestionTexts}>
                            <Text numberOfLines={1} style={styles.suggestionMain}>
                              {item.mainText}
                            </Text>
                            {item.secondaryText ? (
                              <Text numberOfLines={1} style={styles.suggestionSub}>
                                {item.secondaryText}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {activeInput === "destination" && destinationSuggestError ? (
                  <Text style={styles.suggestErrorText}>
                    {destinationSuggestError}
                  </Text>
                ) : null}
              </View>
            </View>
            <Pressable
              onPress={swapEndpoints}
              style={({ pressed }) => [styles.swapBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Swap start and destination"
            >
              <Ionicons name="swap-vertical" size={22} color={GREEN} />
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.routeBtn,
              pressed && styles.pressed,
              routeLoading && styles.routeBtnDisabled,
            ]}
            onPress={buildRoute}
            disabled={routeLoading}
          >
            {routeLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.routeBtnText}>Show route</Text>
            )}
          </Pressable>

          {routeError ? (
            <Text style={styles.routeErrorText}>{routeError}</Text>
          ) : null}
        </View>
      </SafeAreaView>
      ) : null}

      {!tripActivePlan ? (
      <Animated.View
        style={[
          styles.bottomSheet,
          {
            height: expandedSheetHeight,
            paddingBottom: 20 + insets.bottom,
            transform: [{ translateY: sheetTranslateY }],
          },
        ]}
      >
        <View
          style={styles.sheetDragHeader}
          {...sheetPanResponder.panHandlers}
          accessible
          accessibilityRole="button"
          accessibilityLabel={
            sheetExpanded ? "Collapse available routes panel" : "Expand available routes panel"
          }
        >
          <Pressable
            style={styles.grabberHitbox}
            onPress={() => snapSheet(!sheetExpanded)}
            accessibilityRole="button"
            accessibilityLabel={
              sheetExpanded
                ? "Collapse available routes panel"
                : "Expand available routes panel"
            }
          >
          <View style={styles.grabber} />
          </Pressable>
        </View>
        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sheetTitle}>Available Routes</Text>

          <Text style={styles.controlLabel}>Radius</Text>
          <View style={styles.chipsRow}>
            {[500, 1000, 2000].map((m) => (
              <Pressable
                key={m}
                onPress={() => {
                  setRadiusMeters(m);
                  setRoutePlans([]);
                  setSelectedPlanId(null);
                }}
                style={[
                  styles.chip,
                  radiusMeters === m ? styles.chipActive : styles.chipOutline,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    radiusMeters === m && styles.chipTextActive,
                  ]}
                >
                  Radius {m >= 1000 ? `${m / 1000} km` : `${m} m`}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.controlLabel}>Passenger Type</Text>
          <View style={styles.chipsRow}>
            {(
              [
                { key: "regular" as const, label: "Regular" },
                { key: "student" as const, label: "Student" },
                { key: "pwd" as const, label: "PWD" },
                { key: "senior" as const, label: "Senior" },
              ] as const
            ).map(({ key, label }) => (
              <Pressable
                key={key}
                onPress={() => {
                  setDiscountCode(key);
                }}
                style={[
                  styles.chip,
                  discountCode === key ? styles.chipActive : styles.chipOutline,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    discountCode === key && styles.chipTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.controlLabel}>Route Preference</Text>
          <View style={styles.chipsRow}>
            {(
              [
                { key: "all" as const, label: "All Routes" },
                { key: "fastest" as const, label: "Fastest Routes" },
                { key: "cheapest" as const, label: "Cheapest Routes" },
              ] as const
            ).map(({ key, label }) => (
              <Pressable
                key={key}
                onPress={() => setFilter(key)}
                style={[
                  styles.chip,
                  filter === key ? styles.chipActive : styles.chipOutline,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    filter === key && styles.chipTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          {routes.length === 0 ? (
            <Text style={styles.noRoutesText}>
              {hasRouteSearch
                ? "No routes found for this destination in your database."
                : "No routes yet. Search a destination first."}
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.cardsScroll}
              style={styles.cardsScrollOuter}
            >
            {routes.map((r) => {
              const destLabel = destination.trim();
              const isSelected =
                selectedPlanId != null
                  ? r.id === selectedPlanId
                  : r.id === routes[0]?.id;
              const meta = { originLabel, destinationLabel: destLabel };
              const saved =
                !!destLabel && isBookmarked(r, meta);
              return (
                <View
                  key={r.id}
                  style={[styles.routeCard, isSelected && styles.routeCardSelected]}
                >
                  <Pressable
                    onPress={() => {
                      setSelectedPlanId(r.id);
                      setFitMapSignal((n) => n + 1);
                    }}
                    style={({ pressed }) =>
                      pressed ? styles.routeCardPressablePressed : undefined
                    }
                    accessibilityLabel={`Route option. ${r.routeName}. Board ${r.boardStop}. Get off ${r.offStop}.`}
                  >
                    <Text style={styles.routeStopLine}>
                      <Text style={styles.routeStopLabel}>Board: </Text>
                      {r.boardStop}
                    </Text>
                    <Text style={styles.routeStopLine}>
                      <Text style={styles.routeStopLabel}>Get off: </Text>
                      {r.offStop}
                    </Text>
                    <Text style={styles.routeLine}>
                      {r.estimatedText} · {r.transfersText} transfer(s) ·{" "}
                      {r.fareText}
                    </Text>
                    {r.scoreText ? (
                      <Text style={styles.routeLine}>Score: {r.scoreText}</Text>
                    ) : null}
                  </Pressable>
                  <View style={styles.routeCardFooter}>
                    <Pressable
                      style={styles.bookmarkBtn}
                      hitSlop={8}
                      accessibilityLabel={
                        saved ? "Remove bookmark" : "Bookmark route"
                      }
                      onPress={() => {
                        if (!destLabel) {
                          Alert.alert(
                            "Destination needed",
                            "Enter or pick a destination before bookmarking."
                          );
                          return;
                        }
                        toggleBookmark(r, meta);
                      }}
                    >
                      <Ionicons
                        name={saved ? "bookmark" : "bookmark-outline"}
                        size={20}
                        color={GREEN}
                      />
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.startTripBtn,
                        pressed && styles.pressed,
                      ]}
                      onPress={() => startTrip(r)}
                      accessibilityRole="button"
                      accessibilityLabel="Start trip with live GPS"
                    >
                      <Text style={styles.startTripBtnText}>Start trip</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </ScrollView>
          )}
        </ScrollView>
      </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#e9ecef",
  },
  topSafe: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    pointerEvents: "box-none",
  },
  whereCard: {
    marginHorizontal: 16,
    marginTop: 2,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d5e8dc",
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  whereHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  backBtn: {
    padding: 4,
    marginRight: 4,
  },
  whereTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: GREEN,
  },
  headerSpacer: {
    width: 30,
  },
  inputsBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  inputsColumn: {
    flex: 1,
    gap: 10,
  },
  inputRowWrap: {
    position: "relative",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d5e8dc",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
    gap: 10,
    backgroundColor: "#f8fbf9",
  },
  suggestionsBox: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#d5e8dc",
    borderRadius: 12,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e9ecef",
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  suggestionIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#ecf5f0",
    alignItems: "center",
    justifyContent: "center",
  },
  suggestionTexts: {
    flex: 1,
  },
  suggestionMain: {
    fontSize: 14,
    color: "#212529",
    fontWeight: "600",
  },
  suggestionSub: {
    marginTop: 2,
    fontSize: 12,
    color: "#6c757d",
  },
  suggestErrorText: {
    marginTop: 6,
    fontSize: 12,
    color: "#c92a2a",
    lineHeight: 16,
  },
  originDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  originDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GREEN,
  },
  fieldInput: {
    flex: 1,
    fontSize: 15,
    color: "#212529",
    paddingVertical: 2,
  },
  swapBtn: {
    marginLeft: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#ecf5f0",
  },
  routeBtn: {
    marginTop: 10,
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  routeBtnDisabled: {
    opacity: 0.7,
  },
  routeBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  routeErrorText: {
    marginTop: 8,
    fontSize: 13,
    color: "#c92a2a",
    lineHeight: 18,
  },
  bottomSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fdfefd",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 12,
    zIndex: 3,
    overflow: "hidden",
  },
  sheetScroll: {
    flex: 1,
  },
  sheetContent: {
    paddingBottom: 12,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ced4da",
  },
  grabberHitbox: {
    alignSelf: "center",
    paddingTop: 4,
    paddingBottom: 12,
    paddingHorizontal: 40,
  },
  sheetDragHeader: {
    alignSelf: "stretch",
    minHeight: 26,
    justifyContent: "center",
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: GREEN,
    marginBottom: 8,
  },
  controlLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2d6a4f",
    marginBottom: 6,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipOutline: {
    borderColor: GREEN,
    backgroundColor: "#f4faf7",
  },
  chipActive: {
    borderColor: GREEN,
    backgroundColor: GREEN,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: GREEN,
  },
  chipTextActive: {
    color: "#fff",
  },
  noRoutesText: {
    fontSize: 13,
    color: "#495057",
    marginBottom: 10,
  },
  cardsScrollOuter: {
    flexGrow: 0,
  },
  cardsScroll: {
    gap: 12,
    paddingRight: 8,
    paddingVertical: 2,
    alignItems: "flex-start",
    flexGrow: 0,
  },
  routeCard: {
    width: 260,
    backgroundColor: "#fdfefd",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d5e8dc",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    alignSelf: "flex-start",
    flexGrow: 0,
  },
  routeCardSelected: {
    borderColor: GREEN,
    borderWidth: 2,
    backgroundColor: "#f1f7f3",
  },
  routeCardPressablePressed: {
    opacity: 0.92,
  },
  routeStopLine: {
    fontSize: 13,
    color: "#334155",
    marginBottom: 4,
    lineHeight: 17,
  },
  routeStopLabel: {
    fontWeight: "700",
    color: GREEN,
  },
  routeCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    gap: 8,
  },
  bookmarkBtn: {
    padding: 4,
  },
  routeLine: {
    fontSize: 13,
    color: "#495057",
    marginBottom: 3,
    lineHeight: 17,
  },
  startTripBtn: {
    flex: 1,
    backgroundColor: GREEN,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  startTripBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  tripTopBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 6,
    paddingBottom: 6,
    backgroundColor: "rgba(0,0,0,0.52)",
  },
  tripIconBtn: {
    padding: 6,
    width: 40,
    alignItems: "center",
  },
  tripTopTitle: {
    flex: 1,
    textAlign: "center",
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  tripTopSpacer: {
    width: 40,
  },
  tripHudOuter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 6,
    pointerEvents: "box-none",
  },
  tripHudCard: {
    marginHorizontal: 14,
    marginBottom: 8,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#cfe7d9",
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  tripHudRoute: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1f2937",
    marginBottom: 6,
  },
  tripHudMeta: {
    fontSize: 12,
    color: "#64748b",
    marginBottom: 10,
  },
  tripHudStop: {
    fontSize: 14,
    color: "#334155",
    lineHeight: 20,
    marginBottom: 4,
  },
  tripHudStopLabel: {
    fontWeight: "700",
    color: GREEN,
  },
  tripHudDistance: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0d47a1",
    marginTop: 8,
    marginBottom: 6,
  },
  tripHudHint: {
    fontSize: 11,
    lineHeight: 15,
    color: "#868e96",
    marginBottom: 12,
  },
  tripEndBtn: {
    backgroundColor: "#c92a2a",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  tripEndBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.75,
  },
});
