/* eslint-disable react-hooks/set-state-in-effect */
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
import { useAuth } from "@/contexts/AuthContext";
import { useTravel } from "@/contexts/TravelContext";
import * as googleMapsRoutes from "@/lib/googleMapsRoutes";
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
  type DisplayRouteSegment,
  type DisplayRoutePlan,
} from "@/lib/transitPlanOptions";
import { fetchNearestCustomItinerary } from "@/lib/customRouteItineraries";
import { type RouteFilter } from "@/lib/mockTransitRoutes";
import {
  computeFlatFareForTrip,
  fetchGtfsRoutesBetweenPoints,
  fetchGtfsRoutesByShape,
  fetchGtfsRoutesWithGeometry,
  type DiscountCode,
  type TransitRouteRecord,
} from "@/lib/transitRoutes";

const GREEN = "#1B4332";
const FALLBACK_LAT = 14.5995;
const FALLBACK_LNG = 120.9842;
const DLSAU_DESTINATION = "De La Salle Araneta University";
const DLSAU_COORDINATE: LatLng = {
  latitude: 14.670567,
  longitude: 120.999293,
};
const DB_MATCH_POOL_LIMIT = 20;
const MAX_ROUTE_RADIUS_METERS = 500_000;
type ActiveInput = "origin" | "destination" | null;

function isDefaultOriginLabel(label: string) {
  const t = label.trim().toLowerCase();
  return !t || t === "your location" || t === "current location";
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

function polylineDistanceMeters(points: LatLng[]) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += haversineMeters(
      { lat: points[index - 1].latitude, lng: points[index - 1].longitude },
      { lat: points[index].latitude, lng: points[index].longitude }
    );
  }
  return total;
}

function formatCurrency(amount: number, currency: string) {
  if (currency.toUpperCase() === "PHP") return `Php ${amount.toFixed(2)}`;
  return `${currency} ${amount.toFixed(2)}`;
}

function coordinateDistance(a: LatLng, b: LatLng): number {
  const dLat = a.latitude - b.latitude;
  const dLng = a.longitude - b.longitude;
  return dLat * dLat + dLng * dLng;
}

function routeSegmentsForLocation(
  segments: DisplayRouteSegment[],
  location: LatLng
): DisplayRouteSegment[] {
  let closestSegment = -1;
  let closestCoordinate = -1;
  let closestDistance = Number.POSITIVE_INFINITY;

  segments.forEach((segment, segmentIndex) => {
    if (segment.segmentType === "walk" && segmentIndex === 0) return;
    segment.coordinates.forEach((coordinate, coordinateIndex) => {
      const distance = coordinateDistance(location, coordinate);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestSegment = segmentIndex;
        closestCoordinate = coordinateIndex;
      }
    });
  });

  if (closestSegment < 0 || closestCoordinate < 0) return segments;

  return segments.slice(closestSegment).map((segment, index) => ({
    ...segment,
    coordinates:
      index === 0
        ? segment.coordinates.slice(closestCoordinate)
        : segment.coordinates,
  }));
}

function pickSearchParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

export default function SearchMapScreen() {
  const router = useRouter();
  const { session } = useAuth();
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
  const [destination] = useState(DLSAU_DESTINATION);
  const [activeInput, setActiveInput] = useState<ActiveInput>(null);
  const [originSuggestions, setOriginSuggestions] = useState<PlaceSuggestion[]>([]);
  const [originSuggestLoading, setOriginSuggestLoading] = useState(false);
  const [originSuggestError, setOriginSuggestError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RouteFilter>("cheapest");
  const [latitude, setLatitude] = useState(FALLBACK_LAT);
  const [longitude, setLongitude] = useState(FALLBACK_LNG);
  const [searchedOriginCoordinate, setSearchedOriginCoordinate] =
    useState<LatLng | null>(null);
  const [locationReady, setLocationReady] = useState(false);
  const [routePlans, setRoutePlans] = useState<DisplayRoutePlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [hasManuallySelectedRoute, setHasManuallySelectedRoute] = useState(false);
  const [fitMapSignal, setFitMapSignal] = useState(0);
  const [destinationCoord, setDestinationCoord] = useState<LatLng | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [discountCode, setDiscountCode] = useState<DiscountCode>("regular");
  const [routeLoading, setRouteLoading] = useState(false);
  const [hasRouteSearch, setHasRouteSearch] = useState(false);
  const [classSchedules, setClassSchedules] = useState<ClassScheduleItem[]>([]);
  const [tripActivePlan, setTripActivePlan] = useState<DisplayRoutePlan | null>(
    null
  );
  const [tripDetailsExpanded, setTripDetailsExpanded] = useState(false);
  const [navLatitude, setNavLatitude] = useState(latitude);
  const [navLongitude, setNavLongitude] = useState(longitude);
  const [accessPath, setAccessPath] = useState<LatLng[] | null>(null);
  const [accessDurationMinutes, setAccessDurationMinutes] = useState<
    number | null
  >(null);
  const [selectedSegment, setSelectedSegment] =
    useState<DisplayRouteSegment | null>(null);
  const tripWatchRef = useRef<(() => void) | null>(null);
  const routeRequestIdRef = useRef(0);
  const accessRequestRef = useRef<{
    planId: string;
    coordinate: LatLng;
  } | null>(null);

  useEffect(() => {
    const savedDiscount = session?.user.user_metadata?.discount_type;
    if (savedDiscount === "discounted" || savedDiscount === "regular") {
      setDiscountCode(savedDiscount);
    }
  }, [session?.user.user_metadata?.discount_type]);

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
    void loadClassSchedules(session?.user.user_metadata?.class_schedules).then((items) => {
      if (!cancelled) setClassSchedules(items);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user.user_metadata?.class_schedules]);

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
    routeRequestIdRef.current += 1;
    stopTripWatch();
    setTripActivePlan(null);
    setRoutePlans([]);
    setSelectedPlanId(null);
    setHasManuallySelectedRoute(false);
    setSearchedOriginCoordinate(null);
    setDestinationCoord(null);
    setRouteError(null);
    setSelectedSegment(null);
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

  const routes = useMemo<DisplayRoutePlan[]>(() => {
    const withFares = routePlans.map((p) => {
      const fare =
        p.segments
          ? p.customFareValue != null
          ? {
              finalFare:
                discountCode === "discounted"
                  ? p.customFareValue * 0.8
                  : p.customFareValue,
              currency: "PHP",
            }
          : null
          : computeFlatFareForTrip({
              transferCount: p.transferCount,
              discountCode,
              logicalRouteKey: p.dbRouteId ?? p.id,
            });
      return {
        ...p,
        fareText: fare
          ? formatCurrency(fare.finalFare, fare.currency)
          : "Fare unavailable",
        fareValue: fare?.finalFare ?? null,
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
        const aEta = a.etaMinutes ?? Number.POSITIVE_INFINITY;
        const bEta = b.etaMinutes ?? Number.POSITIVE_INFINITY;
        if (aEta !== bEta) return aEta - bEta;
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

    return filter === "all" ? ordered : ordered.slice(0, 1);
  }, [routePlans, discountCode, filter, classSchedules]);

  const routeAlternativesForMap = useMemo(() => {
    if (!routes.some((r) => r.polyline.length > 1)) return undefined;
    const primaryId = selectedPlanId ?? routes[0]?.id ?? null;
    const visibleRoutes = hasManuallySelectedRoute
      ? routes.filter((r) => r.id === primaryId)
      : routes;
    return visibleRoutes.map((r) => ({
      id: r.id,
      coordinates: r.polyline,
      selected: primaryId != null ? r.id === primaryId : false,
    }));
  }, [hasManuallySelectedRoute, routes, selectedPlanId]);

  const selectedMapPlan = useMemo(
    () => routes.find((route) => route.id === selectedPlanId) ?? routes[0],
    [routes, selectedPlanId]
  );

  const selectRoute = useCallback((routeId: string) => {
    setSelectedPlanId(routeId);
    setHasManuallySelectedRoute(true);
    setAccessPath(null);
    setAccessDurationMinutes(null);
    setSelectedSegment(null);
    setFitMapSignal((n) => n + 1);
  }, []);

  const mapRouteSegments = useMemo(() => {
    const plan = selectedMapPlan;
    if (!plan?.segments?.length) return undefined;
    const currentLocation = tripActivePlan
      ? { latitude: navLatitude, longitude: navLongitude }
      : { latitude, longitude };
    const accessSegment: DisplayRouteSegment | null =
      plan.boardingCoordinate &&
      accessPath?.length &&
      accessRequestRef.current?.planId === plan.id
      ? {
          segmentId: "dynamic-access-walk",
          segmentType: "walk",
          coordinates: accessPath,
          label: "Walk to boarding point",
          durationMinutes: accessDurationMinutes,
        }
      : null;
    const routeSegments = tripActivePlan
      ? routeSegmentsForLocation(plan.segments, currentLocation)
      : plan.segments;
    return accessSegment
      ? [accessSegment, ...routeSegments]
      : routeSegments;
  }, [
    selectedMapPlan,
    tripActivePlan,
    navLatitude,
    navLongitude,
    latitude,
    longitude,
    searchedOriginCoordinate,
    accessPath,
    accessDurationMinutes,
  ]);

  useEffect(() => {
    if (!selectedSegment) return;
    const updated = mapRouteSegments?.find(
      (segment) => segment.segmentId === selectedSegment.segmentId
    );
    if (updated && updated !== selectedSegment) {
      setSelectedSegment(updated);
    }
  }, [mapRouteSegments, selectedSegment]);

  useEffect(() => {
    const plan = selectedMapPlan;
    if (!plan?.boardingCoordinate) {
      setAccessPath(null);
      setAccessDurationMinutes(null);
      return;
    }

    const currentLocation = tripActivePlan
      ? searchedOriginCoordinate ?? { latitude: navLatitude, longitude: navLongitude }
      : searchedOriginCoordinate ?? { latitude, longitude };
    const previousRequest = accessRequestRef.current;
    if (previousRequest?.planId !== plan.id) {
      setAccessPath(null);
    }
    if (
      previousRequest?.planId === plan.id &&
      haversineMeters(
        { lat: previousRequest.coordinate.latitude, lng: previousRequest.coordinate.longitude },
        { lat: currentLocation.latitude, lng: currentLocation.longitude }
      ) < 25
    ) {
      return;
    }
    setAccessDurationMinutes(null);
    accessRequestRef.current = { planId: plan.id, coordinate: currentLocation };

    let cancelled = false;
    const requestPlanId = plan.id;
    const timer = setTimeout(() => {
      void googleMapsRoutes.getWalkingRouteBetween(
        { lat: currentLocation.latitude, lng: currentLocation.longitude },
        {
          lat: plan.boardingCoordinate!.latitude,
          lng: plan.boardingCoordinate!.longitude,
        }
      )
        .then((coordinates) => {
          if (
            !cancelled &&
            accessRequestRef.current?.planId === requestPlanId &&
            coordinates.length > 1
          ) {
            setAccessPath(coordinates);
          }
        })
        .catch(() => {
          if (
            !cancelled &&
            accessRequestRef.current?.planId === requestPlanId
          ) {
            setAccessPath(null);
          }
        });
      void googleMapsRoutes
        .getTravelDurationSeconds(
          { lat: currentLocation.latitude, lng: currentLocation.longitude },
          {
            lat: plan.boardingCoordinate!.latitude,
            lng: plan.boardingCoordinate!.longitude,
          },
          "walking"
        )
        .then((seconds) => {
          if (
            !cancelled &&
            accessRequestRef.current?.planId === requestPlanId
          ) {
            setAccessDurationMinutes(Math.max(1, Math.ceil(seconds / 60)));
          }
        })
        .catch(() => {
          if (
            !cancelled &&
            accessRequestRef.current?.planId === requestPlanId
          ) {
            setAccessDurationMinutes(null);
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    selectedMapPlan,
    tripActivePlan,
    navLatitude,
    navLongitude,
    latitude,
    longitude,
    searchedOriginCoordinate,
  ]);

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
    if (tripActivePlan) {
      void addRecentFromTrip(tripActivePlan, {
        originLabel,
        destinationLabel: destination.trim(),
      });
    }
    stopTripWatch();
    setTripActivePlan(null);
  }, [
    addRecentFromTrip,
    destination,
    originLabel,
    stopTripWatch,
    tripActivePlan,
  ]);

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
      setTripDetailsExpanded(false);
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
          accuracy: Location.Accuracy.High,
        });
        if (!cancelled) {
          setLatitude(pos.coords.latitude);
          setLongitude(pos.coords.longitude);
          setLocationReady(true);
        }
      } catch {
        /* keep fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function chooseOriginSuggestion(item: PlaceSuggestion) {
    setOriginLabel(item.description);
    setOriginSuggestions([]);
    setOriginSuggestError(null);
    setActiveInput(null);
    clearRoute();
  }

  async function buildRoute() {
    clearRoute();
    const requestId = routeRequestIdRef.current;
    setHasRouteSearch(true);
    setRouteLoading(true);
    setRouteError(null);
    setActiveInput(null);
    setOriginSuggestions([]);
    setOriginSuggestError(null);
    try {
        const useGpsOrigin = isDefaultOriginLabel(originLabel);
        if (useGpsOrigin && !originLabel.trim()) {
          setOriginLabel("Your location");
        }
        let originGeo: { lat: number; lng: number };
        if (useGpsOrigin) {
          try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") {
              throw new Error("Location permission is required for Your location.");
            }
            const pos = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.High,
            });
            originGeo = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            };
            setLatitude(originGeo.lat);
            setLongitude(originGeo.lng);
            setLocationReady(true);
          } catch (locationError) {
            if (!locationReady) throw locationError;
            originGeo = { lat: latitude, lng: longitude };
          }
        } else {
          originGeo = await geocodeAddress(originLabel);
        }
        setSearchedOriginCoordinate({
          latitude: originGeo.lat,
          longitude: originGeo.lng,
        });

      const customDestinations = await fetchNearestCustomItinerary({
        latitude: originGeo.lat,
        longitude: originGeo.lng,
      }).catch(() => []);

      if (requestId !== routeRequestIdRef.current) return;

      if (customDestinations.length) {
        const customPlans = await Promise.all(
          customDestinations.map(async (customDestination): Promise<DisplayRoutePlan> => {
            if (
              haversineMeters(
                { lat: originGeo.lat, lng: originGeo.lng },
                {
                  lat: customDestination.destination.latitude,
                  lng: customDestination.destination.longitude,
                }
              ) > MAX_ROUTE_RADIUS_METERS
            ) {
              throw new Error("This destination is outside the 500 km route radius.");
            }
            const segmentDetails = await Promise.all(
              customDestination.segments.map(async (segment) => {
          const first = segment.coordinates[0];
          const last = segment.coordinates[segment.coordinates.length - 1];
          if (!first || !last) {
            return { fare: segment.fare, durationMinutes: null };
          }
          try {
            const seconds = await googleMapsRoutes.getTravelDurationSeconds(
              { lat: first[1], lng: first[0] },
              { lat: last[1], lng: last[0] },
              segment.segment_type === "walk" ? "walking" : "driving"
            );
            return {
              fare: segment.fare,
              durationMinutes: Math.max(1, Math.ceil(seconds / 60)),
            };
          } catch {
            return { fare: segment.fare, durationMinutes: null };
          }
              })
            );
            const totalDurationMinutes = segmentDetails.reduce(
        (total, segment) => total + (segment.durationMinutes ?? 0),
        0
            );
            return {
          id: `custom:${customDestination.segments[0].itinerary_id}`,
          routeName:
            customDestination.segments[0].itinerary_name ||
            "Custom DLSAU itinerary",
          transfersText: `${Math.max(
            0,
            customDestination.segments.filter(
              (segment) => segment.segment_type !== "walk"
            ).length - 1
          )}`,
          estimatedText:
            totalDurationMinutes > 0
              ? `${totalDurationMinutes} min`
              : "Time unavailable",
          fareText: "—",
          boardStop: customDestination.boardingName,
          offStop: customDestination.destination.name,
          etaMinutes: totalDurationMinutes > 0 ? totalDurationMinutes : null,
          fareValue: customDestination.fare,
          customFareValue: customDestination.fare,
          boardingCoordinate: customDestination.boardingCoordinate,
          segments: customDestination.segments.map(
            (segment, index): DisplayRouteSegment => ({
              segmentId: segment.segment_id,
              segmentType: segment.segment_type,
              label: segment.segment_name,
              routeId: segment.route_id,
              fare: segmentDetails[index]?.fare,
              durationMinutes: segmentDetails[index]?.durationMinutes,
              coordinates: segment.coordinates.map(([longitude, latitude]) => ({
                latitude: Number(latitude),
                longitude: Number(longitude),
              })),
            })
          ),
          generalizedCost: null,
          transferCount: Math.max(
            0,
            customDestination.segments.filter(
              (segment) => segment.segment_type !== "walk"
            ).length - 1
          ),
          polyline: customDestination.coordinates,
          fromGoogle: false,
            };
          })
        );
        if (requestId !== routeRequestIdRef.current) return;
        const orderedPlans = [...customPlans].sort((a, b) => {
          if (filter === "fastest") {
            return (a.etaMinutes ?? Infinity) - (b.etaMinutes ?? Infinity);
          }
          return (a.fareValue ?? Infinity) - (b.fareValue ?? Infinity);
        });
        const scheduleOrderedPlans = sortRoutesForSchedule(
          orderedPlans,
          classSchedules
        );
        const selectedPlan = scheduleOrderedPlans[0];
        setDestinationCoord(selectedPlan?.segments?.at(-1)?.coordinates.at(-1) ?? null);
        setRoutePlans(scheduleOrderedPlans);
        setSelectedPlanId(selectedPlan?.id ?? null);
        setFitMapSignal((n) => n + 1);
        snapSheet(true);
        return;
      }

      const destGeo = {
        lat: DLSAU_COORDINATE.latitude,
        lng: DLSAU_COORDINATE.longitude,
      };
      if (
        haversineMeters(
          { lat: latitude, lng: longitude },
          { lat: destGeo.lat, lng: destGeo.lng }
        ) > MAX_ROUTE_RADIUS_METERS
      ) {
        throw new Error("This destination is outside the 500 km route radius.");
      }
      setDestinationCoord({
        latitude: destGeo.lat,
        longitude: destGeo.lng,
      });

      const googleItins = await fetchTransitItinerariesFromGoogle(
        originGeo,
        destGeo
      );
      if (requestId !== routeRequestIdRef.current) return;

      let overview: {
        coordinates: LatLng[];
        mode: string;
        summary: string;
      } | null = null;

      if (googleItins.length === 0) {
        const r = await getRouteBetween(originGeo, destGeo);
        if (requestId !== routeRequestIdRef.current) return;
        overview = {
          coordinates: r.coordinates,
          mode: r.mode,
          summary: r.summary,
        };
      }

      const finalizePlansAndBounds = async (pool: TransitRouteRecord[]) => {
        if (requestId !== routeRequestIdRef.current) return;
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
        snapSheet(true);
      };

      const directMatches = await fetchGtfsRoutesBetweenPoints({
        originLat: originGeo.lat,
        originLng: originGeo.lng,
        destinationLat: destGeo.lat,
        destinationLng: destGeo.lng,
        stopRadiusMeters: 600,
      });
      if (requestId !== routeRequestIdRef.current) return;
      const shapeMatches = await fetchGtfsRoutesByShape({
        originLat: originGeo.lat,
        originLng: originGeo.lng,
        destinationLat: destGeo.lat,
        destinationLng: destGeo.lng,
        shapeRadiusMeters: 700,
      });
      if (requestId !== routeRequestIdRef.current) return;
      const geometryMatches = await fetchGtfsRoutesWithGeometry({
        originLat: originGeo.lat,
        originLng: originGeo.lng,
        destinationLat: destGeo.lat,
        destinationLng: destGeo.lng,
        shapeRadiusMeters: 700,
      });
      if (requestId !== routeRequestIdRef.current) return;

      const directByRouteId = new Map(
        directMatches.map((route) => [route.route_id, route])
      );
      const shapeByRouteId = new Map(
        shapeMatches.map((route) => [route.route_id, route])
      );

      // Only pass routes with their own geometry to the plan builder. This
      // prevents a metadata-only route from borrowing another route's line.
      const fetched = geometryMatches.map((geometryRoute) => ({
        ...shapeByRouteId.get(geometryRoute.route_id),
        ...directByRouteId.get(geometryRoute.route_id),
        ...geometryRoute,
      }));

      await finalizePlansAndBounds(fetched);
    } catch (e: unknown) {
      if (requestId !== routeRequestIdRef.current) return;
      clearRoute();
      setRouteError(e instanceof Error ? e.message : "Could not load route.");
      setRouteLoading(false);
    } finally {
      if (requestId === routeRequestIdRef.current) {
        setRouteLoading(false);
      }
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar style={tripActivePlan ? "light" : "dark"} />

      <FullScreenMap
        key={`route-map-${tripActivePlan?.id ?? selectedMapPlan?.id ?? "empty"}-${hasManuallySelectedRoute ? "selected" : "all"}`}
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
          tripActivePlan || selectedMapPlan?.segments?.length
            ? undefined
            : routeAlternativesForMap
        }
        routeSegments={
          mapRouteSegments
        }
        routeRenderKey={tripActivePlan ? tripActivePlan.id : selectedMapPlan?.id}
        destinationCoordinate={destinationCoord}
        navigationMode={!!tripActivePlan}
        trackedCoordinate={
          tripActivePlan
            ? { latitude: navLatitude, longitude: navLongitude }
            : null
        }
        fitEdgePadding={fitEdgePadding}
        fitSignal={tripActivePlan ? 0 : fitMapSignal}
        selectedSegmentId={selectedSegment?.segmentId}
        onSegmentPress={setSelectedSegment}
      />

      {selectedSegment ? (
        <View style={styles.segmentPopup}>
          <Text style={styles.segmentPopupTitle}>
            {selectedSegment.segmentType === "walk"
              ? "Walking"
              : `${selectedSegment.segmentType[0].toUpperCase()}${selectedSegment.segmentType.slice(1)} route`}
          </Text>
          <Text style={styles.segmentPopupLine}>
            Type: {selectedSegment.segmentType}
          </Text>
          <Text style={styles.segmentPopupLine}>
            Fare:{" "}
            {selectedSegment.fare == null
              ? selectedSegment.segmentType === "walk"
                ? "Free"
                : "Fare unavailable"
              : formatCurrency(
                  discountCode === "discounted"
                    ? selectedSegment.fare * 0.8
                    : selectedSegment.fare,
                  "PHP"
                )}
          </Text>
          <Text style={styles.segmentPopupLine}>
            Time:{" "}
            {selectedSegment.durationMinutes != null
              ? `${selectedSegment.durationMinutes} min`
              : "Calculating..."}
          </Text>
          <Pressable onPress={() => setSelectedSegment(null)}>
            <Text style={styles.segmentPopupClose}>Close</Text>
          </Pressable>
        </View>
      ) : null}

      {tripActivePlan ? (
        <View style={styles.tripExperience} pointerEvents="box-none">
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
              <Ionicons name="arrow-back" size={26} color="#fff" />
            </Pressable>
            <Text style={styles.tripTopTitle} numberOfLines={1}>Trip in progress</Text>
            <View style={styles.tripTopSpacer} />
          </SafeAreaView>

          <View style={styles.tripContent}>
            <View style={styles.tripLocationCard}>
              <View style={styles.tripLocationRow}>
                <View style={styles.originDot}><View style={styles.originDotInner} /></View>
                <Text style={styles.tripLocationText} numberOfLines={1}>{originLabel}</Text>
              </View>
              <View style={styles.tripConnector} />
              <View style={styles.tripLocationRow}>
                <Ionicons name="location-outline" size={22} color={GREEN} />
                <Text style={styles.tripLocationText} numberOfLines={1}>
                  {tripActivePlan.offStop || destination}
                </Text>
              </View>
            </View>

            <Pressable
              style={styles.tripCompactHeader}
              onPress={() => setTripDetailsExpanded((expanded) => !expanded)}
              accessibilityRole="button"
              accessibilityLabel={tripDetailsExpanded ? "Collapse trip details" : "Expand trip details"}
            >
              <View style={styles.tripCompactHeaderText}>
                <Text style={styles.tripCompactTitle} numberOfLines={1}>
                  {tripActivePlan.routeName}
                </Text>
                <Text style={styles.tripCompactMeta}>
                  {tripActivePlan.estimatedText} · {formatDistance(polylineDistanceMeters(tripActivePlan.polyline))}
                </Text>
              </View>
              <Ionicons
                name={tripDetailsExpanded ? "chevron-down" : "chevron-up"}
                size={22}
                color={GREEN}
              />
            </Pressable>

            {tripDetailsExpanded ? <View style={styles.tripExpandedPanel}>
              <View style={styles.tripDetailsCard}>
              <Text style={styles.tripSectionTitle}>Trip Details</Text>
              <View style={styles.tripStatsRow}>
                <View style={styles.tripStat}>
                  <Ionicons name="time-outline" size={18} color={GREEN} />
                  <Text style={styles.tripStatLabel}>Duration</Text>
                  <Text style={styles.tripStatValue}>{tripActivePlan.estimatedText}</Text>
                  </View>
                <View style={styles.tripStat}>
                  <Ionicons name="navigate-outline" size={18} color={GREEN} />
                  <Text style={styles.tripStatLabel}>Distance</Text>
                  <Text style={styles.tripStatValue}>
                    {formatDistance(polylineDistanceMeters(tripActivePlan.polyline))}
                  </Text>
                </View>
                <View style={styles.tripStat}>
                  <Ionicons name="bus-outline" size={18} color={GREEN} />
                  <Text style={styles.tripStatLabel}>Route</Text>
                  <Text style={styles.tripStatValue} numberOfLines={1}>
                    {tripActivePlan.routeName}
                  </Text>
                </View>
              </View>
              <View style={styles.tripFareHeader}>
                <Text style={styles.tripFareTitle}>Estimated Fare</Text>
                <Text style={styles.tripFareBadge}>{discountCode === "discounted" ? "Discounted" : "Regular"}</Text>
              </View>
              <View style={styles.tripFareRow}>
                <Text style={styles.tripFareLabel}>{tripActivePlan.boardStop}</Text>
                <Text style={styles.tripFareValue}>{tripActivePlan.fareText}</Text>
              </View>
              <View style={styles.tripFareRow}>
                <Text style={styles.tripFareLabel}>{tripActivePlan.offStop}</Text>
                <Text style={styles.tripFareValue}>{tripActivePlan.transfersText} transfer(s)</Text>
              </View>
              {tripActivePlan.segments
                ?.filter((segment) => segment.segmentType !== "walk" && segment.fare != null)
                .map((segment) => (
                  <View key={`fare-${segment.segmentId}`} style={styles.tripFareRow}>
                    <Text style={styles.tripFareLabel} numberOfLines={1}>
                      {segment.label ?? segment.routeId ?? "Transit segment"}
                    </Text>
                    <Text style={styles.tripFareValue}>
                      {formatCurrency(
                        discountCode === "discounted"
                          ? (segment.fare ?? 0) * 0.8
                          : segment.fare ?? 0,
                        "PHP"
                      )}
                    </Text>
                  </View>
                ))}
              {tripActivePlan.segments?.some(
                (segment) => segment.segmentType !== "walk" && segment.fare != null
              ) ? (
                <View style={styles.tripFareTotalRow}>
                  <Text style={styles.tripFareTotalLabel}>Total fare</Text>
                  <Text style={styles.tripFareTotalValue}>{tripActivePlan.fareText}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.tripStepsCard}>
              <Text style={styles.tripSectionTitle}>Step-by-Step Instructions</Text>
              {tripActivePlan.segments?.map((segment, index) => (
                <View key={segment.segmentId} style={styles.tripStepRow}>
                  <View style={styles.tripStepNumber}><Text style={styles.tripStepNumberText}>{index + 1}</Text></View>
                  <Text style={styles.tripStepText} numberOfLines={2}>
                    {segment.segmentType === "walk"
                      ? segment.label ?? "Walk"
                      : segment.label ?? segment.routeId ?? `${segment.segmentType} ride`}
                  </Text>
                </View>
              ))}
              {distanceToDestinationMeters != null ? (
                <Text style={styles.tripLiveDistance}>
                  {distanceToDestinationMeters < 120
                    ? "You are near your destination."
                    : `${formatDistance(distanceToDestinationMeters)} remaining`}
                </Text>
              ) : null}
              <Pressable
              style={({ pressed }) => [styles.tripEndBtn, pressed && styles.pressed]}
              onPress={endTrip}
              accessibilityRole="button"
              accessibilityLabel="End trip"
            >
              <Text style={styles.tripEndBtnText}>End trip</Text>
              </Pressable>
            </View>
            </View> : null}
          </View>
        </View>
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
                    editable={false}
                    accessibilityLabel="Fixed destination: De La Salle Araneta University"
                    placeholder="De La Salle Araneta University"
                    placeholderTextColor="#868e96"
                  />
                </View>
              </View>
            </View>
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
                      selectRoute(r.id);
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
    backgroundColor: GREEN,
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
  tripExperience: {
    ...StyleSheet.absoluteFill,
    zIndex: 5,
  },
  tripContent: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 10,
  },
  tripContentInner: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 12,
  },
  tripCompactHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 7,
  },
  tripCompactHeaderText: {
    flex: 1,
    marginRight: 10,
  },
  tripCompactTitle: {
    color: GREEN,
    fontSize: 15,
    fontWeight: "700",
  },
  tripCompactMeta: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 3,
  },
  tripExpandedPanel: {
    gap: 10,
    marginTop: 10,
  },
  tripLocationCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 7,
    elevation: 6,
  },
  tripLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 38,
  },
  tripLocationText: {
    flex: 1,
    color: "#495057",
    fontSize: 14,
  },
  tripConnector: {
    height: 8,
    width: 2,
    backgroundColor: "#b8c7bf",
    marginLeft: 9,
  },
  tripDetailsCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 7,
    elevation: 5,
  },
  tripSectionTitle: {
    color: GREEN,
    fontSize: 17,
    fontWeight: "700",
    borderBottomWidth: 1,
    borderBottomColor: "#cfd8d2",
    paddingBottom: 8,
    marginBottom: 10,
  },
  tripStatsRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#d9e0dc",
    paddingBottom: 10,
    marginBottom: 10,
  },
  tripStat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    borderRightWidth: 1,
    borderRightColor: "#cfd8d2",
    paddingHorizontal: 4,
  },
  tripStatLabel: {
    color: "#6b7280",
    fontSize: 11,
  },
  tripStatValue: {
    color: "#234d3d",
    fontSize: 12,
    fontWeight: "700",
  },
  tripFareHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  tripFareTitle: {
    color: "#246047",
    fontSize: 13,
    fontWeight: "700",
  },
  tripFareBadge: {
    color: "#fff",
    backgroundColor: "#245f4a",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: "700",
  },
  tripFareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  tripFareLabel: {
    flex: 1,
    color: "#334155",
    fontSize: 12,
  },
  tripFareValue: {
    color: "#245f4a",
    fontSize: 12,
    fontWeight: "700",
  },
  tripFareTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#cfd8d2",
    marginTop: 6,
    paddingTop: 8,
  },
  tripFareTotalLabel: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
  },
  tripFareTotalValue: {
    color: "#245f4a",
    fontSize: 13,
    fontWeight: "800",
  },
  tripStepsCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 150,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 7,
    elevation: 5,
  },
  tripStepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 9,
  },
  tripStepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#e7f2eb",
    alignItems: "center",
    justifyContent: "center",
  },
  tripStepNumberText: {
    color: GREEN,
    fontSize: 12,
    fontWeight: "700",
  },
  tripStepText: {
    flex: 1,
    color: "#334155",
    fontSize: 13,
    lineHeight: 18,
  },
  tripLiveDistance: {
    color: "#0d47a1",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 6,
  },
  segmentPopup: {
    position: "absolute",
    top: 150,
    left: 16,
    right: 16,
    zIndex: 8,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#FFD43B",
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  segmentPopupTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1f2937",
    marginBottom: 6,
  },
  segmentPopupLine: {
    fontSize: 13,
    color: "#334155",
    lineHeight: 20,
  },
  segmentPopupClose: {
    alignSelf: "flex-end",
    color: GREEN,
    fontWeight: "700",
    marginTop: 6,
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
  tripHudSegments: {
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    marginTop: 6,
    marginBottom: 8,
    paddingTop: 8,
  },
  tripHudSectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 4,
  },
  tripHudSegment: {
    fontSize: 13,
    lineHeight: 18,
    color: "#334155",
    marginBottom: 2,
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
