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
  Vibration,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AndroidPlaceAutocomplete,
  type AndroidPlaceAutocompleteHandle,
} from "@/components/AndroidPlaceAutocomplete";
import { FullScreenMap } from "@/components/FullScreenMap";
import { useAuth } from "@/contexts/AuthContext";
import { useTravel } from "@/contexts/TravelContext";
import * as googleMapsRoutes from "@/lib/googleMapsRoutes";
import {
  geocodeAddress,
  getPlaceSuggestions,
  type LatLng,
  type PlaceSuggestion,
} from "@/lib/googleMapsRoutes";
import {
  type ClassScheduleItem,
  getNextClassInfo,
  loadClassSchedules,
  sortRoutesForSchedule,
} from "@/lib/classSchedules";
import {
  type DisplayRouteSegment,
  type DisplayRoutePlan,
} from "@/lib/transitPlanOptions";
import { fetchNearestCustomItinerary } from "@/lib/customRouteItineraries";
import { type RouteFilter } from "@/lib/mockTransitRoutes";
import {
  computeFlatFareForTrip,
  BUS_BASE_FARE_PHP,
  computeJeepneyFare,
  TRICYCLE_SHARED_FARE_PHP,
  TRICYCLE_SOLO_FARE_PHP,
  type DiscountCode,
} from "@/lib/transitRoutes";
import { speakTripNotification, stopTripSpeech } from "@/lib/voiceAnnouncer";

const GREEN = "#1B4332";
const FALLBACK_LAT = 14.5995;
const FALLBACK_LNG = 120.9842;
const DLSAU_DESTINATION = "De La Salle Araneta University";
const DLSAU_COORDINATE: LatLng = {
  latitude: 14.670567,
  longitude: 120.999293,
};
const MAX_ROUTE_RADIUS_METERS = 500_000;
const CUSTOM_ROUTE_DATA_TIMEOUT_MS = 20000;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  });
}

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

function closestRouteCoordinate(points: LatLng[], location: LatLng): LatLng | undefined {
  return points.reduce<LatLng | undefined>((closest, point) => {
    if (!closest) return point;
    const currentDistance = haversineMeters(
      { lat: point.latitude, lng: point.longitude },
      { lat: location.latitude, lng: location.longitude }
    );
    const closestDistance = haversineMeters(
      { lat: closest.latitude, lng: closest.longitude },
      { lat: location.latitude, lng: location.longitude }
    );
    return currentDistance < closestDistance ? point : closest;
  }, undefined);
}

function formatCurrency(amount: number, currency: string) {
  const rounded = Math.ceil(amount);
  if (currency.toUpperCase() === "PHP") return `Php ${rounded.toFixed(2)}`;
  return `${currency} ${rounded.toFixed(2)}`;
}

function fareForSegment(
  segment: DisplayRouteSegment,
  tricycleMode: "shared" | "solo" = "shared"
): number {
  if (segment.segmentType === "walk") return 0;
  if (segment.segmentType === "tricycle") {
    return tricycleMode === "solo"
      ? TRICYCLE_SOLO_FARE_PHP
      : TRICYCLE_SHARED_FARE_PHP;
  }
  if (segment.segmentType === "bus") return BUS_BASE_FARE_PHP;
  return Math.ceil(computeJeepneyFare(polylineDistanceMeters(segment.coordinates)));
}

const COMMUTER_TIPS = [
  "Verify your route with the driver or transport personnel prior to boarding to confirm the vehicle will pass your destination.",
  "Estimated fares are approximate and subject to prevailing traffic conditions and official tariff rates, typically within a 15% variance.",
];

function formatSegmentVehicleDetail(segment: {
  segmentType: "walk" | "jeepney" | "tricycle" | "bus";
  details?: string | null;
  whatToSay?: string | null;
}) {
  const detail = segment.details?.trim();
  const say = segment.whatToSay?.trim();
  if (segment.segmentType === "walk") {
    return {
      badgeText: null,
      instructionText: null,
      sayToDriverText: null,
      transferMessage: null,
      transferSpeech: null,
    };
  }

  const sayPrompt = say ? `Tell driver: ${say}` : null;

  if (segment.segmentType === "tricycle") {
    const lookFor = detail ? `Look for: ${detail} tricycle` : null;
    let transferMsg = "Transfer point nearby. Prepare for your upcoming tricycle ride.";
    if (detail && say) {
      transferMsg = `Transfer point nearby. Look for a ${detail} tricycle and tell the driver: ${say}.`;
    } else if (detail) {
      transferMsg = `Transfer point nearby. Look for a ${detail} tricycle to continue your trip.`;
    } else if (say) {
      transferMsg = `Transfer point nearby. Board a tricycle and tell the driver: ${say}.`;
    }

    let transferSpch = "Transfer point nearby. Prepare to alight for your tricycle ride.";
    if (detail && say) {
      transferSpch = `Transfer point nearby. Prepare to alight. Look for a ${detail} tricycle and tell the driver: ${say}.`;
    } else if (detail) {
      transferSpch = `Transfer point nearby. Prepare to alight and look for a ${detail} tricycle.`;
    } else if (say) {
      transferSpch = `Transfer point nearby. Prepare to alight. Tell the driver: ${say}.`;
    }

    return {
      badgeText: detail ? `${detail} Tricycle` : "Tricycle",
      instructionText: lookFor,
      sayToDriverText: sayPrompt,
      transferMessage: transferMsg,
      transferSpeech: transferSpch,
    };
  }

  if (segment.segmentType === "bus") {
    const lookFor = detail ? `Look for signboard: ${detail}` : null;
    let transferMsg = "Transfer point nearby. Prepare for your upcoming bus ride.";
    if (detail && say) {
      transferMsg = `Transfer point nearby. Look for a bus with placard: ${detail}, and tell the conductor: ${say}.`;
    } else if (detail) {
      transferMsg = `Transfer point nearby. Look for a bus with placard: ${detail}.`;
    } else if (say) {
      transferMsg = `Transfer point nearby. Tell the conductor: ${say}.`;
    }

    let transferSpch = "Transfer point nearby. Prepare to alight for your bus.";
    if (detail && say) {
      transferSpch = `Transfer point nearby. Prepare to alight. Look for a bus with placard: ${detail}, and tell the conductor: ${say}.`;
    } else if (detail) {
      transferSpch = `Transfer point nearby. Prepare to alight and look for a bus with placard: ${detail}.`;
    } else if (say) {
      transferSpch = `Transfer point nearby. Prepare to alight and tell the conductor: ${say}.`;
    }

    return {
      badgeText: detail ? `Placard: ${detail}` : "Bus",
      instructionText: lookFor,
      sayToDriverText: sayPrompt,
      transferMessage: transferMsg,
      transferSpeech: transferSpch,
    };
  }

  // Jeepney
  const lookFor = detail ? `Look for signboard: ${detail}` : null;
  let transferMsg = "Transfer point nearby. Prepare for your upcoming jeepney ride.";
  if (detail && say) {
    transferMsg = `Transfer point nearby. Look for a jeepney with signboard: ${detail}, and tell the driver: ${say}.`;
  } else if (detail) {
    transferMsg = `Transfer point nearby. Look for a jeepney with signboard: ${detail}.`;
  } else if (say) {
    transferMsg = `Transfer point nearby. Tell the driver: ${say}.`;
  }

  let transferSpch = "Transfer point nearby. Prepare to alight for your jeepney.";
  if (detail && say) {
    transferSpch = `Transfer point nearby. Prepare to alight. Look for a jeepney with signboard: ${detail}, and tell the driver: ${say}.`;
  } else if (detail) {
    transferSpch = `Transfer point nearby. Prepare to alight and look for a jeepney with signboard: ${detail}.`;
  } else if (say) {
    transferSpch = `Transfer point nearby. Prepare to alight and tell the driver: ${say}.`;
  }

  return {
    badgeText: detail ? `Signboard: ${detail}` : "Jeepney",
    instructionText: lookFor,
    sayToDriverText: sayPrompt,
    transferMessage: transferMsg,
    transferSpeech: transferSpch,
  };
}

function CommuterTipsCard() {
  return (
    <View style={styles.commuterTipsCard}>
      <View style={styles.commuterTipsHeader}>
        <Ionicons name="information-circle-outline" size={17} color="#B45309" />
        <Text style={styles.commuterTipsTitle}>Commuter Advisories</Text>
      </View>
      {COMMUTER_TIPS.map((tip, idx) => (
        <View key={idx} style={styles.commuterTipItem}>
          <Text style={styles.commuterTipBullet}>•</Text>
          <Text style={styles.commuterTipText}>{tip}</Text>
        </View>
      ))}
    </View>
  );
}

function routeSegmentsForLocation(
  segments: DisplayRouteSegment[],
  location: LatLng,
  progressRef?: { segmentIndex: number; coordinateIndex: number }
): DisplayRouteSegment[] {
  if (!segments || segments.length === 0) return [];

  const startSegment = progressRef
    ? Math.min(progressRef.segmentIndex, segments.length - 1)
    : 0;
  let closestSegment = -1;
  let closestCoordinate = -1;
  let closestPoint: LatLng | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (let sIdx = startSegment; sIdx < segments.length; sIdx++) {
    const segment = segments[sIdx];
    const startCoord =
      sIdx === startSegment && progressRef ? progressRef.coordinateIndex : 0;

    for (
      let coordinateIndex = startCoord;
      coordinateIndex < segment.coordinates.length - 1;
      coordinateIndex += 1
    ) {
      const start = segment.coordinates[coordinateIndex];
      const end = segment.coordinates[coordinateIndex + 1];
      const longitudeScale = Math.cos((location.latitude * Math.PI) / 180);
      const startX = (start.longitude - location.longitude) * longitudeScale;
      const startY = start.latitude - location.latitude;
      const endX = (end.longitude - location.longitude) * longitudeScale;
      const endY = end.latitude - location.latitude;
      const dx = endX - startX;
      const dy = endY - startY;
      const denominator = dx * dx + dy * dy;
      const ratio =
        denominator === 0
          ? 0
          : Math.max(0, Math.min(1, -(startX * dx + startY * dy) / denominator));
      const candidate = {
        latitude: start.latitude + (end.latitude - start.latitude) * ratio,
        longitude: start.longitude + (end.longitude - start.longitude) * ratio,
      };
      const distanceX = (candidate.longitude - location.longitude) * longitudeScale;
      const distanceY = candidate.latitude - location.latitude;
      const distance = distanceX * distanceX + distanceY * distanceY;
      if (distance < closestDistance) {
        closestDistance = distance;
        closestSegment = sIdx;
        closestCoordinate = coordinateIndex;
        closestPoint = candidate;
      }
    }
  }

  if (
    closestSegment < 0 ||
    closestCoordinate < 0 ||
    !closestPoint
  ) {
    return segments;
  }

  // Update progress forward so passed route segments never reappear
  if (progressRef) {
    if (
      closestSegment > progressRef.segmentIndex ||
      (closestSegment === progressRef.segmentIndex &&
        closestCoordinate >= progressRef.coordinateIndex)
    ) {
      progressRef.segmentIndex = closestSegment;
      progressRef.coordinateIndex = closestCoordinate;
    }
  }

  const trimPoint = closestPoint;
  const trimmed: DisplayRouteSegment[] = [];

  for (let sIdx = closestSegment; sIdx < segments.length; sIdx++) {
    const segment = segments[sIdx];
    if (sIdx === closestSegment) {
      const remainingCoords = [
        trimPoint,
        ...segment.coordinates.slice(closestCoordinate + 1),
      ];
      if (remainingCoords.length >= 2) {
        trimmed.push({
          ...segment,
          coordinates: remainingCoords,
        });
      }
    } else {
      if (segment.coordinates.length >= 2) {
        trimmed.push(segment);
      }
    }
  }

  return trimmed;
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
  const [sheetContentHeight, setSheetContentHeight] = useState<number | null>(null);

  const handleContentLayout = useCallback((height: number) => {
    const rounded = Math.ceil(height);
    if (rounded > 40) {
      setSheetContentHeight((prev) => {
        if (prev != null && Math.abs(prev - rounded) < 4) {
          return prev;
        }
        return rounded;
      });
    }
  }, []);

  const collapsedSheetHeight = Math.min(
    Math.max(windowHeight * 0.26, 220),
    windowHeight * 0.38
  );
  const maxAllowedSheetHeight = Math.min(
    windowHeight * 0.78,
    Math.max(collapsedSheetHeight + 80, windowHeight - insets.top - 90)
  );
  const expandedSheetHeight = sheetContentHeight
    ? Math.min(
        maxAllowedSheetHeight,
        Math.max(collapsedSheetHeight + 40, sheetContentHeight + 66 + insets.bottom)
      )
    : Math.min(
        maxAllowedSheetHeight,
        Math.max(windowHeight * 0.52, 400)
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
  const androidAutocompleteRef =
    useRef<AndroidPlaceAutocompleteHandle>(null);
  const [filter, setFilter] = useState<RouteFilter>("all");
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
  const [tripAlertBanner, setTripAlertBanner] = useState<{
    type: "destination" | "transfer";
    title: string;
    message: string;
  } | null>(null);
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
  const tripProgressRef = useRef({ segmentIndex: 0, coordinateIndex: 0 });
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

    const hasDefinedRoute = Boolean(orig || dest);
    if (hasDefinedRoute) {
      const timer = setTimeout(() => {
        router.setParams({ origin: undefined, destination: undefined });
        void buildRoute();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [params.destination, params.origin, router]);

  useEffect(() => {
    let cancelled = false;
    const userMeta = session?.user?.user_metadata?.class_schedules;
    const userId = session?.user?.id ?? null;
    setClassSchedules([]);
    void loadClassSchedules(userMeta, userId).then((items) => {
      if (!cancelled) setClassSchedules(items);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, session?.user?.user_metadata?.class_schedules]);

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
    stopTripSpeech();
    tripProgressRef.current = { segmentIndex: 0, coordinateIndex: 0 };
    setRouteLoading(false);
    setOriginSuggestLoading(false);
    setTripActivePlan(null);
    setRoutePlans([]);
    setSelectedPlanId(null);
    setHasManuallySelectedRoute(false);
    setSearchedOriginCoordinate(null);
    setDestinationCoord(null);
    setRouteError(null);
    setSelectedSegment(null);
    setAccessPath(null);
    setAccessDurationMinutes(null);
    accessRequestRef.current = null;
  }, [stopTripWatch]);

  useEffect(() => {
    if (activeInput !== "origin") return;
    if (isDefaultOriginLabel(originLabel) || originLabel.trim().length < 2) {
      setOriginSuggestLoading(false);
      setOriginSuggestions([]);
      setOriginSuggestError(null);
      return;
    }

    let cancelled = false;
    setOriginSuggestLoading(true);
    const timer = setTimeout(async () => {
      if (Platform.OS === "android") {
        androidAutocompleteRef.current?.setQuery(
          originLabel,
          latitude,
          longitude
        );
        return;
      }
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
      const updatedSegments = p.segments?.map((segment) => ({
        ...segment,
        fare: fareForSegment(segment),
      }));
      const hasTricycle =
        updatedSegments?.some(
          (segment) => segment.segmentType === "tricycle"
        ) ||
        /tricycle|trike/i.test(p.routeName) ||
        /tricycle|trike/i.test(p.googleSummary ?? "");

      const sharedFare = updatedSegments?.length
        ? Math.ceil(
            updatedSegments.reduce(
              (total, segment) => total + fareForSegment(segment, "shared"),
              0
            ) * (discountCode === "discounted" ? 0.8 : 1)
          )
        : null;

      const soloFare =
        updatedSegments?.length && hasTricycle
          ? Math.ceil(
              updatedSegments.reduce((total, segment) => {
                if (segment.segmentType === "tricycle") {
                  // Solo or special trips for tricycle segments are excluded from the discount!
                  return total + TRICYCLE_SOLO_FARE_PHP;
                }
                const segFare = fareForSegment(segment, "solo");
                return (
                  total +
                  (discountCode === "discounted"
                    ? Math.ceil(segFare * 0.8)
                    : segFare)
                );
              }, 0)
            )
          : hasTricycle
            ? TRICYCLE_SOLO_FARE_PHP
            : null;

      const flatFare = computeFlatFareForTrip({
        transferCount: p.transferCount,
        discountCode,
        logicalRouteKey: p.dbRouteId ?? p.id,
        distanceMeters: polylineDistanceMeters(p.polyline),
        vehicleType: p.vehicleType,
      });

      const finalFareValue = Math.ceil(sharedFare ?? flatFare.finalFare);
      const fareText =
        hasTricycle && soloFare != null
          ? `₱${finalFareValue} shared · ₱${soloFare} solo`
          : formatCurrency(finalFareValue, "PHP");

      return {
        ...p,
        segments: updatedSegments ?? p.segments,
        fareText,
        fareValue: finalFareValue,
        soloFareValue:
          hasTricycle && soloFare != null ? soloFare : finalFareValue,
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
    const visibleRoutes = routes;
    const baseline = visibleRoutes.find((r) => r.id === primaryId);
    const mapLocation = tripActivePlan
      ? { latitude: navLatitude, longitude: navLongitude }
      : { latitude, longitude };
    return visibleRoutes.map((r) => {
      const timeDifference =
        baseline?.etaMinutes != null && r.etaMinutes != null
          ? r.etaMinutes - baseline.etaMinutes
          : null;

      const sharedDifference =
        baseline?.fareValue != null && r.fareValue != null
          ? r.fareValue - baseline.fareValue
          : null;

      const baselineSolo =
        baseline?.soloFareValue ?? baseline?.fareValue ?? null;
      const rSolo = r.soloFareValue ?? r.fareValue ?? null;
      const soloDifference =
        baselineSolo != null && rSolo != null
          ? rSolo - baselineSolo
          : null;

      const hasTricycleInvolved = Boolean(
        baseline?.segments?.some((s) => s.segmentType === "tricycle") ||
          r.segments?.some((s) => s.segmentType === "tricycle") ||
          /tricycle|trike/i.test(baseline?.routeName ?? "") ||
          /tricycle|trike/i.test(r.routeName) ||
          /tricycle|trike/i.test(baseline?.googleSummary ?? "") ||
          /tricycle|trike/i.test(r.googleSummary ?? "") ||
          (baseline?.soloFareValue != null &&
            baseline?.fareValue != null &&
            baseline.soloFareValue !== baseline.fareValue) ||
          (r.soloFareValue != null &&
            r.fareValue != null &&
            r.soloFareValue !== r.fareValue)
      );

      const roundedSharedDiff =
        sharedDifference != null && Math.abs(sharedDifference) > 0.001
          ? Math.ceil(Math.abs(sharedDifference))
          : 0;

      const roundedSoloDiff =
        soloDifference != null && Math.abs(soloDifference) > 0.001
          ? Math.ceil(Math.abs(soloDifference))
          : 0;

      let fareLabel: string | null = null;

      // If a tricycle segment is involved and solo difference diverges from shared difference
      if (
        hasTricycleInvolved &&
        soloDifference != null &&
        sharedDifference != null &&
        Math.abs(soloDifference - sharedDifference) > 0.001
      ) {
        const sharedText =
          roundedSharedDiff === 0
            ? "same shared"
            : `₱${roundedSharedDiff} ${sharedDifference < 0 ? "cheaper" : "more"} shared`;

        const soloText =
          roundedSoloDiff === 0
            ? "same solo"
            : soloDifference < 0
              ? `-₱${roundedSoloDiff} solo`
              : `+₱${roundedSoloDiff} solo`;

        fareLabel = `${sharedText} (${soloText})`;
      } else if (roundedSharedDiff > 0) {
        fareLabel = `₱${roundedSharedDiff} ${sharedDifference! < 0 ? "cheaper" : "more expensive"}`;
      }

      const comparisonLabel =
        r.id !== primaryId
          ? [
              timeDifference != null && timeDifference !== 0
                ? `${Math.abs(timeDifference)} min ${timeDifference < 0 ? "faster" : "slower"}`
                : null,
              fareLabel,
            ].filter(Boolean).join(" · ") || "Similar route"
          : undefined;
      return {
        id: r.id,
        coordinates: r.polyline,
        selected: primaryId != null ? r.id === primaryId : false,
        comparisonLabel,
        comparisonCoordinate:
          r.id !== primaryId
            ? closestRouteCoordinate(r.polyline, mapLocation)
            : undefined,
      };
    });
  }, [
    routes,
    selectedPlanId,
    tripActivePlan,
    navLatitude,
    navLongitude,
    latitude,
    longitude,
  ]);

  const nextClass = useMemo(
    () => getNextClassInfo(classSchedules),
    [classSchedules]
  );
  const scheduleWarning = useMemo(() => {
    if (!nextClass.item || nextClass.minutesUntil == null || !routes.length) {
      return null;
    }
    const selectedRoute =
      routes.find((route) => route.id === selectedPlanId) ?? routes[0];
    const selectedLate =
      selectedRoute?.etaMinutes != null &&
      selectedRoute.etaMinutes > nextClass.minutesUntil;
    if (!selectedLate) return null;
    const onTime = routes.find(
      (route) =>
        route.etaMinutes != null && route.etaMinutes <= nextClass.minutesUntil!
    );
    return {
      subject: nextClass.item.subject,
      minutes: nextClass.minutesUntil,
      onTime,
      allLate: !onTime,
    };
  }, [nextClass, routes, selectedPlanId]);

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
    const plan = tripActivePlan ?? selectedMapPlan;
    if (!plan) return undefined;

    const baseSegments: DisplayRouteSegment[] =
      plan.segments && plan.segments.length > 0
        ? plan.segments
        : plan.polyline && plan.polyline.length > 1
          ? [
              {
                segmentId: `primary-segment-${plan.id}`,
                segmentType: plan.vehicleType ?? "jeepney",
                coordinates: plan.polyline,
                label: plan.routeName,
                fare: plan.fareValue ?? undefined,
                durationMinutes: plan.etaMinutes ?? undefined,
              },
            ]
          : [];

    if (!baseSegments.length) return undefined;

    const currentLocation = tripActivePlan
      ? { latitude: navLatitude, longitude: navLongitude }
      : searchedOriginCoordinate ?? { latitude, longitude };

    const distanceToBoarding = plan.boardingCoordinate
      ? haversineMeters(
          { lat: currentLocation.latitude, lng: currentLocation.longitude },
          {
            lat: plan.boardingCoordinate.latitude,
            lng: plan.boardingCoordinate.longitude,
          }
        )
      : Infinity;
    const hasReachedBoarding = distanceToBoarding <= 35;

    const effectiveAccessCoords =
      accessPath && accessPath.length > 1
        ? accessPath
        : plan.boardingCoordinate
          ? [
              { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
              { latitude: plan.boardingCoordinate.latitude, longitude: plan.boardingCoordinate.longitude },
            ]
          : null;

    const accessSegment: DisplayRouteSegment | null =
      plan.boardingCoordinate &&
      effectiveAccessCoords &&
      effectiveAccessCoords.length > 1 &&
      (!tripActivePlan || !hasReachedBoarding)
        ? {
            segmentId: "dynamic-access-walk",
            segmentType: "walk",
            coordinates: effectiveAccessCoords,
            label: "Walk to boarding point",
            durationMinutes: accessDurationMinutes,
          }
        : null;

    const candidateSegments =
      accessSegment && (!tripActivePlan || !hasReachedBoarding)
        ? [accessSegment, ...baseSegments]
        : baseSegments;

    const routeSegments = tripActivePlan
      ? routeSegmentsForLocation(
          candidateSegments,
          currentLocation,
          tripProgressRef.current
        )
      : candidateSegments;

    return routeSegments;
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
    const plan = tripActivePlan ?? selectedMapPlan;
    if (!plan?.boardingCoordinate) {
      setAccessPath(null);
      setAccessDurationMinutes(null);
      accessRequestRef.current = null;
      return;
    }

    const currentLocation = tripActivePlan
      ? { latitude: navLatitude, longitude: navLongitude }
      : searchedOriginCoordinate ?? { latitude, longitude };
    const previousRequest = accessRequestRef.current;
    if (previousRequest?.planId !== plan.id) {
      setAccessPath(null);
      setAccessDurationMinutes(null);
    }
    if (
      accessPath?.length &&
      previousRequest?.planId === plan.id &&
      haversineMeters(
        { lat: previousRequest.coordinate.latitude, lng: previousRequest.coordinate.longitude },
        { lat: currentLocation.latitude, lng: currentLocation.longitude }
      ) < 25
    ) {
      return;
    }
    accessRequestRef.current = { planId: plan.id, coordinate: currentLocation };

    let cancelled = false;
    const timer = setTimeout(() => {
      void googleMapsRoutes.getWalkingRouteBetween(
        { lat: currentLocation.latitude, lng: currentLocation.longitude },
        {
          lat: plan.boardingCoordinate!.latitude,
          lng: plan.boardingCoordinate!.longitude,
        }
      )
        .then((coordinates) => {
          if (!cancelled && coordinates.length > 1) {
            setAccessPath(coordinates);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setAccessPath([
              { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
              { latitude: plan.boardingCoordinate!.latitude, longitude: plan.boardingCoordinate!.longitude },
            ]);
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
          if (!cancelled) {
            setAccessDurationMinutes(Math.max(1, Math.ceil(seconds / 60)));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setAccessDurationMinutes(null);
          }
        });
    }, 150);

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

  const notifiedRef = useRef({ destination: false, segment: "" });
  useEffect(() => {
    if (!tripActivePlan || !destinationCoord) {
      notifiedRef.current = { destination: false, segment: "" };
      stopTripSpeech();
      setTripAlertBanner(null);
      return;
    }
    const destinationDistance = haversineMeters(
      { lat: navLatitude, lng: navLongitude },
      { lat: destinationCoord.latitude, lng: destinationCoord.longitude }
    );
    if (destinationDistance <= 100 && !notifiedRef.current.destination) {
      notifiedRef.current.destination = true;
      try {
        Vibration.vibrate([0, 500, 200, 500]);
      } catch {
        /* platform fallback */
      }
      const title = "Destination Reached";
      const message = "You are close to your destination! Tap 'End trip' when you arrive.";
      setTripAlertBanner({
        type: "destination",
        title,
        message,
      });
      speakTripNotification("You are close to your destination. You have arrived.");
      Alert.alert(
        "Destination reached",
        "You have arrived near your destination. You can now conclude your trip."
      );
      return;
    }
    const nearby = tripActivePlan.segments?.find((segment, index) => {
      // The initial segment (index 0) is the start terminal/stop of the route, not a transfer point
      if (index === 0) return false;
      const endpoint = segment.coordinates[0];
      return (
        endpoint &&
        haversineMeters(
          { lat: navLatitude, lng: navLongitude },
          { lat: endpoint.latitude, lng: endpoint.longitude }
        ) <= 150
      );
    });
    if (nearby && notifiedRef.current.segment !== nearby.segmentId) {
      notifiedRef.current.segment = nearby.segmentId;
      try {
        Vibration.vibrate([0, 400, 200, 400]);
      } catch {
        /* platform fallback */
      }
      const title =
        nearby.segmentType === "walk" ? "Approaching Stop" : "Transfer Point Nearby";
      const vehicleDetail = formatSegmentVehicleDetail(nearby);
      const message =
        vehicleDetail.transferMessage ??
        nearby.label ??
        `Prepare for your upcoming ${nearby.segmentType} segment.`;
      setTripAlertBanner({
        type: "transfer",
        title,
        message,
      });
      const speech =
        vehicleDetail.transferSpeech ??
        (nearby.segmentType === "walk"
          ? "Approaching stop. Prepare to alight."
          : `Transfer point nearby. Prepare for your upcoming ${nearby.segmentType} segment.`);
      speakTripNotification(speech);
      Alert.alert(title, message);
    }
  }, [tripActivePlan, destinationCoord, navLatitude, navLongitude]);

  const endTrip = useCallback(async () => {
    if (tripActivePlan) {
      await addRecentFromTrip(tripActivePlan, {
        originLabel: originLabel.trim() || "Current Location",
        destinationLabel: destination.trim() || "De La Salle Araneta University",
      });
    }
    stopTripWatch();
    stopTripSpeech();
    tripProgressRef.current = { segmentIndex: 0, coordinateIndex: 0 };
    setTripActivePlan(null);
    setTripAlertBanner(null);
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
      tripProgressRef.current = { segmentIndex: 0, coordinateIndex: 0 };

      let currentLat = latitude;
      let currentLng = longitude;
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        currentLat = pos.coords.latitude;
        currentLng = pos.coords.longitude;
        setNavLatitude(currentLat);
        setNavLongitude(currentLng);
      } catch {
        setNavLatitude(latitude);
        setNavLongitude(longitude);
      }

      // If user starts their trip already at or near any terminal/stop, mark it as acknowledged
      // so it never fires a "Transfer point nearby" or "Approaching stop" notification on start
      const initialNearbySegment = plan.segments?.find((segment) => {
        const endpoint = segment.coordinates[0];
        return (
          endpoint &&
          haversineMeters(
            { lat: currentLat, lng: currentLng },
            { lat: endpoint.latitude, lng: endpoint.longitude }
          ) <= 150
        );
      });

      notifiedRef.current = {
        destination: false,
        segment: initialNearbySegment?.segmentId ?? (plan.segments?.[0]?.segmentId || ""),
      };

      setTripActivePlan(plan);
      await addRecentFromTrip(plan, {
        originLabel: originLabel.trim() || "Current Location",
        destinationLabel: destination.trim() || "De La Salle Araneta University",
      });
      setTripDetailsExpanded(false);
      snapSheet(false);

      const firstTransitSegment = plan.segments?.find(
        (segment) => segment.segmentType !== "walk"
      );
      if (firstTransitSegment) {
        const look = firstTransitSegment.details?.trim();
        const say = firstTransitSegment.whatToSay?.trim();
        if (firstTransitSegment.segmentType === "tricycle") {
          let msg = `Trip started towards ${destination.trim() || "De La Salle Araneta University"}.`;
          if (look && say) {
            msg = `Trip started. Proceed to your boarding point, look for a ${look} tricycle, and tell the driver: ${say}.`;
          } else if (look) {
            msg = `Trip started. Proceed to your boarding point and look for a ${look} tricycle.`;
          } else if (say) {
            msg = `Trip started. Board a tricycle and tell the driver: ${say}.`;
          }
          speakTripNotification(msg);
        } else {
          let msg = `Trip started towards ${destination.trim() || "De La Salle Araneta University"}.`;
          if (look && say) {
            msg = `Trip started. Proceed to your boarding point, look for the ${firstTransitSegment.segmentType} with signboard: ${look}, and tell the driver: ${say}.`;
          } else if (look) {
            msg = `Trip started. Proceed to your boarding point and look for the ${firstTransitSegment.segmentType} with signboard: ${look}.`;
          } else if (say) {
            msg = `Trip started. Board the ${firstTransitSegment.segmentType} and tell the driver: ${say}.`;
          }
          speakTripNotification(msg);
        }
      } else {
        speakTripNotification(
          `Trip started towards ${destination.trim() || "De La Salle Araneta University"}.`
        );
      }
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
    const loadingTimeout = setTimeout(() => {
      if (requestId !== routeRequestIdRef.current) return;
      routeRequestIdRef.current += 1;
      setRouteLoading(false);
      setRouteError(
        "Route search timed out. Check your connection and try again."
      );
    }, 30000);
    setHasRouteSearch(true);
    setFilter("all");
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
            let pos: Location.LocationObject | null = null;
            try {
              pos = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
              });
            } catch {
              pos = await Location.getLastKnownPositionAsync();
            }
            if (!pos) {
              pos = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Lowest,
              });
            }
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

      const customDestinations = await withTimeout(
        fetchNearestCustomItinerary({
          latitude: originGeo.lat,
          longitude: originGeo.lng,
        }),
        CUSTOM_ROUTE_DATA_TIMEOUT_MS,
        "Custom route data timed out."
      ).catch(() => []);

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
          fareValue:
            customDestination.fare != null
              ? Math.ceil(customDestination.fare)
              : null,
          customFareValue:
            customDestination.fare != null
              ? Math.ceil(customDestination.fare)
              : null,
          boardingCoordinate: customDestination.boardingCoordinate,
          segments: customDestination.segments.map(
            (segment, index): DisplayRouteSegment => ({
              segmentId: segment.segment_id,
              segmentType: segment.segment_type,
              label: segment.segment_name,
              details: segment.segment_details ? segment.segment_details.trim() : null,
              whatToSay: segment.what_to_say ? segment.what_to_say.trim() : null,
              routeId: segment.route_id,
              fare:
                segmentDetails[index]?.fare != null
                  ? Math.ceil(segmentDetails[index]!.fare)
                  : null,
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
        const scheduleOrderedPlans =
          classSchedules && classSchedules.length > 0
            ? sortRoutesForSchedule(orderedPlans, classSchedules)
            : orderedPlans;
        const selectedPlan = scheduleOrderedPlans[0];
        setDestinationCoord(selectedPlan?.segments?.at(-1)?.coordinates.at(-1) ?? null);
        setRoutePlans(scheduleOrderedPlans);
        setSelectedPlanId(selectedPlan?.id ?? null);
        setFitMapSignal((n) => n + 1);
        return;
      }

      if (requestId !== routeRequestIdRef.current) return;
      clearRoute();
      setRouteError("No custom routes found near this location.");
      setRouteLoading(false);
    } catch (e: unknown) {
      if (requestId !== routeRequestIdRef.current) return;
      clearRoute();
      setRouteError(e instanceof Error ? e.message : "Could not load route.");
      setRouteLoading(false);
    } finally {
      clearTimeout(loadingTimeout);
      if (requestId === routeRequestIdRef.current) {
        setRouteLoading(false);
      }
    }
  }

  const renderSegmentDetailsCard = () => {
    if (!selectedSegment) return null;

    const isWalk = selectedSegment.segmentType === "walk";
    const isJeepney = selectedSegment.segmentType === "jeepney";
    const isTricycle = selectedSegment.segmentType === "tricycle";
    const isBus = selectedSegment.segmentType === "bus";

    let modeTitle = "Walking";
    let modeBadge = "Walk";
    let iconName: keyof typeof Ionicons.glyphMap = "walk-outline";
    let badgeBg = "#F1F5F9";
    let badgeBorder = "#E2E8F0";
    let badgeColor = "#475569";

    if (isJeepney) {
      modeTitle = "Jeepney";
      modeBadge = "Jeepney";
      iconName = "bus-outline";
      badgeBg = "#E0F2FE";
      badgeBorder = "#BAE6FD";
      badgeColor = "#0284C7";
    } else if (isTricycle) {
      modeTitle = "Tricycle";
      modeBadge = "Tricycle";
      iconName = "bicycle-outline";
      badgeBg = "#FEF3C7";
      badgeBorder = "#FDE68A";
      badgeColor = "#D97706";
    } else if (isBus) {
      modeTitle = "Bus";
      modeBadge = "Bus";
      iconName = "bus-outline";
      badgeBg = "#F3E8FF";
      badgeBorder = "#E9D5FF";
      badgeColor = "#7E22CE";
    }

    // Capitalized label or title
    const rawLabel = selectedSegment.label?.trim();
    const displayTitle = rawLabel
      ? rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1)
      : `${modeTitle} Segment`;

    // Distance calculation
    const distMeters = polylineDistanceMeters(selectedSegment.coordinates);
    const distanceText = distMeters > 0 ? formatDistance(distMeters) : null;

    // Fare calculation
    let fareText = "Free";
    if (isTricycle) {
      const shared = Math.ceil(
        discountCode === "discounted"
          ? TRICYCLE_SHARED_FARE_PHP * 0.8
          : TRICYCLE_SHARED_FARE_PHP
      );
      const solo = TRICYCLE_SOLO_FARE_PHP;
      fareText = `₱${shared} shared · ₱${solo} solo`;
    } else if (isBus) {
      const busFare = Math.ceil(
        discountCode === "discounted"
          ? BUS_BASE_FARE_PHP * 0.8
          : BUS_BASE_FARE_PHP
      );
      fareText = `₱${busFare}`;
    } else if (isJeepney) {
      const rawFare = selectedSegment.fare ?? computeJeepneyFare(distMeters);
      const finalFare = Math.ceil(
        discountCode === "discounted" ? rawFare * 0.8 : rawFare
      );
      fareText = `₱${finalFare}${discountCode === "discounted" ? " (Discounted)" : ""}`;
    } else if (!isWalk) {
      fareText =
        selectedSegment.fare != null
          ? `₱${Math.ceil(
              discountCode === "discounted"
                ? selectedSegment.fare * 0.8
                : selectedSegment.fare
            )}`
          : "Standard fare";
    }

    // Duration calculation
    let durationText: string | null = null;
    if (
      selectedSegment.durationMinutes != null &&
      selectedSegment.durationMinutes > 0
    ) {
      durationText = `${Math.ceil(selectedSegment.durationMinutes)} min`;
    } else if (selectedSegment.coordinates.length >= 2) {
      const speed = isWalk ? 75 : 250;
      const estMin = Math.max(1, Math.round(distMeters / speed));
      durationText = `${estMin} min`;
    }

    return (
      <View style={styles.segmentCard} pointerEvents="auto">
        <View style={styles.segmentCardHeader}>
          <View
            style={[
              styles.segmentBadge,
              { backgroundColor: badgeBg, borderColor: badgeBorder },
            ]}
          >
            <Ionicons name={iconName} size={13} color={badgeColor} />
            <Text style={[styles.segmentBadgeText, { color: badgeColor }]}>
              {modeBadge}
            </Text>
          </View>
          <Pressable
            onPress={() => setSelectedSegment(null)}
            hitSlop={10}
            style={({ pressed }) => [
              styles.segmentCloseBtn,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Close segment details"
          >
            <Ionicons name="close" size={16} color="#64748B" />
          </Pressable>
        </View>

        <Text style={styles.segmentTitle} numberOfLines={2}>
          {displayTitle}
        </Text>

        {(() => {
          const vehicleDetail = formatSegmentVehicleDetail(selectedSegment);
          if (!vehicleDetail.instructionText && !vehicleDetail.sayToDriverText) return null;
          return (
            <View style={{ gap: 4, marginTop: 6 }}>
              {vehicleDetail.instructionText ? (
                <View style={styles.segmentDetailCallout}>
                  <Text style={styles.segmentDetailCalloutText}>
                    {vehicleDetail.instructionText}
                  </Text>
                </View>
              ) : null}
              {vehicleDetail.sayToDriverText ? (
                <View style={styles.segmentSayCallout}>
                  <Text style={styles.segmentSayCalloutText}>
                    {vehicleDetail.sayToDriverText}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })()}

        <View style={styles.segmentChipsRow}>
          <View style={[styles.segmentChip, styles.segmentChipFare]}>
            <Ionicons
              name={isWalk ? "walk-outline" : "cash-outline"}
              size={13}
              color={GREEN}
            />
            <Text style={styles.segmentChipFareText}>{fareText}</Text>
          </View>

          {durationText ? (
            <View style={styles.segmentChip}>
              <Ionicons name="time-outline" size={13} color="#475569" />
              <Text style={styles.segmentChipText}>{durationText}</Text>
            </View>
          ) : null}

          {distanceText ? (
            <View style={styles.segmentChip}>
              <Ionicons name="navigate-outline" size={13} color="#475569" />
              <Text style={styles.segmentChipText}>{distanceText}</Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      {Platform.OS === "android" ? (
        <AndroidPlaceAutocomplete
          ref={androidAutocompleteRef}
          onSuggestions={(suggestions, error) => {
            setOriginSuggestions(suggestions);
            setOriginSuggestError(error ?? null);
            setOriginSuggestLoading(false);
          }}
        />
      ) : null}
      <StatusBar style={tripActivePlan ? "light" : "dark"} />

      <FullScreenMap
        key={`route-map-${tripActivePlan?.id ?? selectedMapPlan?.id ?? "empty"}-${hasManuallySelectedRoute ? "selected" : "all"}`}
        latitude={tripActivePlan ? navLatitude : latitude}
        longitude={tripActivePlan ? navLongitude : longitude}
        polylineCoordinates={
          tripActivePlan
            ? undefined
            : routeAlternativesForMap?.length
              ? undefined
              : routes[0]?.polyline
        }
        routeAlternatives={
          tripActivePlan || filter !== "all"
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
        onSegmentPress={(seg) =>
          setSelectedSegment((prev) =>
            prev?.segmentId === seg.segmentId ? null : seg
          )
        }
        onAlternativePress={selectRoute}
      />

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

          {renderSegmentDetailsCard()}

          {tripAlertBanner ? (
            <View style={styles.tripAlertBannerWrapper} pointerEvents="box-none">
              <View
                style={[
                  styles.tripAlertBanner,
                  tripAlertBanner.type === "destination"
                    ? styles.tripAlertBannerDestination
                    : styles.tripAlertBannerTransfer,
                ]}
              >
                <Ionicons
                  name={
                    tripAlertBanner.type === "destination"
                      ? "checkmark-circle"
                      : "notifications"
                  }
                  size={24}
                  color="#fff"
                />
                <View style={styles.tripAlertBannerContent}>
                  <Text style={styles.tripAlertBannerTitle}>
                    {tripAlertBanner.title}
                  </Text>
                  <Text style={styles.tripAlertBannerText}>
                    {tripAlertBanner.message}
                  </Text>
                </View>
                <Pressable
                  onPress={() => speakTripNotification(tripAlertBanner.message)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Replay audio announcement"
                  style={{ marginRight: 6 }}
                >
                  <Ionicons name="volume-high-outline" size={22} color="#fff" />
                </Pressable>
                <Pressable
                  onPress={() => {
                    stopTripSpeech();
                    setTripAlertBanner(null);
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss notification"
                >
                  <Ionicons name="close" size={20} color="#fff" />
                </Pressable>
              </View>
            </View>
          ) : null}

          {!tripDetailsExpanded ? (
            <View style={styles.tripCollapsedContainer} pointerEvents="box-none">
              <View style={styles.tripCollapsedCard}>
                <View style={styles.tripCollapsedTopRow}>
                  <View style={styles.tripCollapsedBadge}>
                    <Ionicons name="navigate" size={11} color="#059669" />
                    <Text style={styles.tripCollapsedBadgeText}>ACTIVE TRIP</Text>
                  </View>
                  <Text style={styles.tripCollapsedMeta}>
                    {tripActivePlan.estimatedText} · {formatDistance(polylineDistanceMeters(tripActivePlan.polyline))}
                  </Text>
                </View>

                <Text style={styles.tripCollapsedTitle} numberOfLines={1}>
                  {tripActivePlan.routeName}
                </Text>

                <View style={styles.tripCollapsedLocationRow}>
                  <View style={styles.originDotSmall}><View style={styles.originDotInnerSmall} /></View>
                  <Text style={styles.tripCollapsedLocationText} numberOfLines={1}>{originLabel}</Text>
                  <Ionicons name="arrow-forward" size={13} color="#94A3B8" />
                  <Ionicons name="location-sharp" size={13} color={GREEN} />
                  <Text style={styles.tripCollapsedLocationText} numberOfLines={1}>
                    {tripActivePlan.offStop || destination}
                  </Text>
                </View>

                <Pressable
                  style={({ pressed }) => [styles.tripPullUpBtn, pressed && styles.pressed]}
                  onPress={() => setTripDetailsExpanded(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Pull up trip details"
                >
                  <Text style={styles.tripPullUpBtnText}>View directions & details</Text>
                  <Ionicons name="chevron-up" size={18} color={GREEN} />
                </Pressable>
              </View>
            </View>
          ) : null}

          {tripDetailsExpanded ? (
            <View style={styles.tripExpandedModalOverlay} pointerEvents="box-none">
              <View style={styles.tripExpandedSheet}>
                <View style={styles.tripSheetHeader}>
                  <View style={styles.tripSheetDragBar} />
                  <View style={styles.tripSheetHeaderRow}>
                    <View style={styles.tripSheetHeaderText}>
                      <Text style={styles.tripSheetTitle} numberOfLines={1}>
                        {tripActivePlan.routeName}
                      </Text>
                      <Text style={styles.tripSheetSubtitle}>
                        {tripActivePlan.estimatedText} · {formatDistance(polylineDistanceMeters(tripActivePlan.polyline))}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => setTripDetailsExpanded(false)}
                      style={({ pressed }) => [
                        styles.tripSheetCloseBtn,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Pull down trip details"
                      hitSlop={12}
                    >
                      <Ionicons name="chevron-down" size={22} color="#1E293B" />
                    </Pressable>
                  </View>
                </View>

                <ScrollView
                  style={styles.tripSheetScroll}
                  contentContainerStyle={styles.tripSheetScrollContent}
                  showsVerticalScrollIndicator={true}
                >
                  <View style={styles.tripSheetLocationCard}>
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
                      <Ionicons name="cash-outline" size={18} color={GREEN} />
                      <Text style={styles.tripStatLabel}>Est. Fare</Text>
                      <Text style={styles.tripStatValue} numberOfLines={1}>
                        {tripActivePlan.fareText}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.tripSectionHeader}>
                    <Ionicons name="trail-sign-outline" size={17} color={GREEN} />
                    <Text style={styles.tripSectionTitle}>Step-by-Step Directions</Text>
                  </View>

                  {tripActivePlan.segments?.map((segment, index) => {
                    const vehicleDetail = formatSegmentVehicleDetail(segment);
                    return (
                      <View key={segment.segmentId} style={styles.tripStepRow}>
                        <View style={styles.tripStepNumber}>
                          <Text style={styles.tripStepNumberText}>{index + 1}</Text>
                        </View>
                        <View style={styles.tripStepContent}>
                          <Text style={styles.tripStepText}>
                            {segment.segmentType === "walk"
                              ? segment.label ?? "Walk"
                              : segment.label ?? segment.routeId ?? `${segment.segmentType} ride`}
                          </Text>
                          {vehicleDetail.instructionText ? (
                            <View style={styles.tripStepVehiclePill}>
                              <Text style={styles.tripStepVehicleText}>
                                {vehicleDetail.instructionText}
                              </Text>
                            </View>
                          ) : null}
                          {vehicleDetail.sayToDriverText ? (
                            <View style={styles.tripStepSayPill}>
                              <Text style={styles.tripStepSayText}>
                                {vehicleDetail.sayToDriverText}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}

                  {distanceToDestinationMeters != null ? (
                    <Text style={styles.tripLiveDistance}>
                      {distanceToDestinationMeters < 120
                        ? "You are near your destination."
                        : `${formatDistance(distanceToDestinationMeters)} remaining`}
                    </Text>
                  ) : null}

                  <View style={styles.tripSectionHeader}>
                    <Ionicons name="receipt-outline" size={17} color={GREEN} />
                    <Text style={styles.tripSectionTitle}>Fare Breakdown</Text>
                  </View>

                  {(() => {
                    const transitSegments = (tripActivePlan.segments ?? []).filter(
                      (segment) => segment.segmentType !== "walk"
                    );
                    if (transitSegments.length > 0) {
                      return transitSegments.map((segment) => {
                        const isTricycle = segment.segmentType === "tricycle";
                        const isBus = segment.segmentType === "bus";
                        const distMeters = polylineDistanceMeters(segment.coordinates);

                        const legLabel =
                          segment.label ?? segment.routeId ?? `${segment.segmentType} ride`;
                        let legValue = "";
                        let legNote = "";

                        if (isTricycle) {
                          const shared = Math.ceil(
                            discountCode === "discounted"
                              ? TRICYCLE_SHARED_FARE_PHP * 0.8
                              : TRICYCLE_SHARED_FARE_PHP
                          );
                          const solo = TRICYCLE_SOLO_FARE_PHP;
                          legValue = `₱${shared} shared · ₱${solo} solo`;
                          legNote =
                            "₱15 shared, ₱50 solo/special";
                        } else if (isBus) {
                          const busFare = Math.ceil(
                            discountCode === "discounted"
                              ? BUS_BASE_FARE_PHP * 0.8
                              : BUS_BASE_FARE_PHP
                          );
                          legValue = `₱${busFare}`;
                          legNote = "₱35 base fare";
                        } else {
                          const jFare = computeJeepneyFare(distMeters);
                          const finalJFare = Math.ceil(
                            discountCode === "discounted" ? jFare * 0.8 : jFare
                          );
                          legValue = `₱${finalJFare}`;
                          legNote =
                            "₱14 base fare for 4 km (+₱2/km thereafter)";
                        }

                        return (
                          <View
                            key={`fare-${segment.segmentId}`}
                            style={styles.tripFareLegContainer}
                          >
                            <View style={styles.tripFareRow}>
                              <Text style={styles.tripFareLabel} numberOfLines={1}>
                                {legLabel}
                              </Text>
                              <Text style={styles.tripFareValue}>{legValue}</Text>
                            </View>
                            <Text style={styles.tripFareNote}>{legNote}</Text>
                          </View>
                        );
                      });
                    }
                    return null;
                  })()}

                  <View style={styles.tripFareTotalRow}>
                    <Text style={styles.tripFareTotalLabel}>Total estimated fare</Text>
                    <Text style={styles.tripFareTotalValue}>{tripActivePlan.fareText}</Text>
                  </View>

                  <CommuterTipsCard />

                  <Pressable
                    style={({ pressed }) => [styles.tripEndBtn, pressed && styles.pressed]}
                    onPress={endTrip}
                    accessibilityRole="button"
                    accessibilityLabel="End trip"
                  >
                    <Text style={styles.tripEndBtnText}>End Trip</Text>
                  </Pressable>
                </ScrollView>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {!tripActivePlan ? (
      <SafeAreaView style={styles.topSafe} edges={["top"]} pointerEvents="box-none">
        <View style={styles.whereCard} pointerEvents="auto">
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
        {renderSegmentDetailsCard()}
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
          bounces={false}
          overScrollMode="never"
          onContentSizeChange={(_, h) => handleContentLayout(h)}
        >
          <View onLayout={(e) => handleContentLayout(e.nativeEvent.layout.height)}>
            <Text style={styles.sheetTitle}>Available Routes</Text>
          {scheduleWarning ? (
            <View style={styles.scheduleWarning}>
              <View style={styles.scheduleWarningHeader}>
                <Ionicons
                  name={scheduleWarning.allLate ? "warning" : "time"}
                  size={18}
                  color="#b45309"
                />
                <Text style={styles.scheduleWarningTitle}>
                  {scheduleWarning.allLate ? "Late Arrival Warning" : "Schedule Alert"}
                </Text>
              </View>
              <Text style={styles.scheduleWarningText}>
                Your {scheduleWarning.subject} starts in {scheduleWarning.minutes} min.
                {scheduleWarning.allLate
                  ? " All available routes are estimated to arrive late for this class."
                  : ` Taking this route may make you late. Take ${scheduleWarning.onTime?.routeName} instead to arrive on time.`}
              </Text>
              {scheduleWarning.onTime ? (
                <Pressable
                  style={styles.scheduleSwitchBtn}
                  onPress={() => selectRoute(scheduleWarning.onTime!.id)}
                >
                  <Ionicons name="swap-horizontal" size={16} color="#fff" />
                  <Text style={styles.scheduleSwitchBtnText}>
                    Switch to {scheduleWarning.onTime.routeName}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

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
              const hasTricycle = r.segments?.some(
                (segment) => segment.segmentType === "tricycle"
              );
              const tricycleFareText = hasTricycle
                ? `₱${Math.ceil(
                    r.segments!.reduce((total, segment) => {
                      const baseFare = fareForSegment(segment, "shared");
                      return (
                        total +
                        (discountCode === "discounted"
                          ? Math.ceil(baseFare * 0.8)
                          : baseFare)
                      );
                    }, 0)
                  )} shared · ₱${Math.ceil(
                    r.segments!.reduce((total, segment) => {
                      if (segment.segmentType === "tricycle") {
                        // Solo or special trips for tricycle segments are excluded from the discount
                        return total + TRICYCLE_SOLO_FARE_PHP;
                      }
                      const baseFare = fareForSegment(segment, "solo");
                      return (
                        total +
                        (discountCode === "discounted"
                          ? Math.ceil(baseFare * 0.8)
                          : baseFare)
                      );
                    }, 0)
                  )} solo`
                : null;
              return (
                <View
                  key={r.id}
                  style={[
                    styles.routeCard,
                    filter === "all" && !isSelected && styles.routeCardMuted,
                    isSelected && styles.routeCardSelected,
                  ]}
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
                    {tricycleFareText && !r.fareText.includes("solo") ? (
                      <Text style={styles.tricycleFareText}>
                        Estimated fare: {tricycleFareText}
                      </Text>
                    ) : null}
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
          {(() => {
            const rideDetailSegments: DisplayRouteSegment[] =
              selectedMapPlan?.segments?.length
                ? selectedMapPlan.segments
                : selectedMapPlan
                  ? [
                      {
                        segmentId: `primary-${selectedMapPlan.id}`,
                        segmentType:
                          selectedMapPlan.vehicleType === "bus"
                            ? "bus"
                            : /tricycle|trike/i.test(selectedMapPlan.routeName)
                              ? "tricycle"
                              : "jeepney",
                        label: selectedMapPlan.routeName,
                        fare: selectedMapPlan.fareValue ?? undefined,
                        durationMinutes: selectedMapPlan.etaMinutes ?? undefined,
                        coordinates: selectedMapPlan.polyline,
                      },
                    ]
                  : [];

            if (!rideDetailSegments.length) return null;

            return (
              <>
                <View style={styles.rideDetailsCard}>
                  <Text style={styles.rideDetailsTitle}>Ride details</Text>
                  {rideDetailSegments.map((segment, index) => {
                  let modeText = "Walk";
                  if (segment.segmentType === "jeepney") {
                    modeText = "Jeepney";
                  } else if (segment.segmentType === "tricycle") {
                    modeText = "Tricycle";
                  } else if (segment.segmentType === "bus") {
                    modeText = "Bus";
                  }

                  let fareText: string | null = null;
                  if (segment.segmentType === "tricycle") {
                    const shared = Math.ceil(
                      discountCode === "discounted"
                        ? TRICYCLE_SHARED_FARE_PHP * 0.8
                        : TRICYCLE_SHARED_FARE_PHP
                    );
                    const solo = TRICYCLE_SOLO_FARE_PHP;
                    fareText = `₱${shared} shared · ₱${solo} solo`;
                  } else if (segment.segmentType === "bus") {
                    const busFare = Math.ceil(
                      discountCode === "discounted"
                        ? BUS_BASE_FARE_PHP * 0.8
                        : BUS_BASE_FARE_PHP
                    );
                    fareText = `₱${busFare}`;
                  } else if (segment.segmentType === "jeepney") {
                    const distMeters = polylineDistanceMeters(segment.coordinates);
                    const rawFare = segment.fare ?? computeJeepneyFare(distMeters);
                    const finalFare = Math.ceil(
                      discountCode === "discounted" ? rawFare * 0.8 : rawFare
                    );
                    fareText = `₱${finalFare}`;
                  }

                  let timeText: string | null = null;
                  if (segment.durationMinutes != null && segment.durationMinutes > 0) {
                    timeText = `${Math.ceil(segment.durationMinutes)} min`;
                  } else if (segment.coordinates.length >= 2) {
                    const distMeters = polylineDistanceMeters(segment.coordinates);
                    const speedMetersPerMin = segment.segmentType === "walk" ? 75 : 250;
                    const estMin = Math.max(1, Math.round(distMeters / speedMetersPerMin));
                    timeText = `${estMin} min`;
                  }

                  const descParts = [modeText, fareText, timeText].filter(Boolean);
                  const description = descParts.join(" - ");

                  return (
                    <View key={segment.segmentId} style={styles.rideDetailRow}>
                      <View style={styles.rideDetailNumber}>
                        <Text style={styles.rideDetailNumberText}>{index + 1}</Text>
                      </View>
                      <View style={styles.rideDetailText}>
                        <Text style={styles.rideDetailLabel}>
                          {segment.label ?? segment.routeId ?? `${modeText} ride`}
                        </Text>
                        <Text style={styles.rideDetailMeta}>{description}</Text>
                        {(() => {
                          const vehicleDetail = formatSegmentVehicleDetail(segment);
                          if (!vehicleDetail.instructionText && !vehicleDetail.sayToDriverText) return null;
                          return (
                            <View style={{ gap: 4, marginTop: 4 }}>
                              {vehicleDetail.instructionText ? (
                                <View style={styles.rideDetailVehiclePill}>
                                  <Text style={styles.rideDetailVehicleText}>
                                    {vehicleDetail.instructionText}
                                  </Text>
                                </View>
                              ) : null}
                              {vehicleDetail.sayToDriverText ? (
                                <View style={styles.rideDetailSayPill}>
                                  <Text style={styles.rideDetailSayText}>
                                    {vehicleDetail.sayToDriverText}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          );
                        })()}
                      </View>
                    </View>
                  );
                })}
                </View>
                <CommuterTipsCard />
              </>
            );
          })()}
          </View>
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
  routeCardMuted: {
    borderColor: "#cbd5e1",
    backgroundColor: "#f1f3f5",
    opacity: 0.72,
  },
  routeCardPressablePressed: {
    opacity: 0.92,
  },
  routeComparisonInline: {
    color: "#2d6a4f",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 5,
  },
  tricycleFareText: {
    color: "#7f5539",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3,
  },
  scheduleWarning: {
    backgroundColor: "#fffbeb",
    borderColor: "#f59e0b",
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  scheduleWarningHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  scheduleWarningTitle: {
    color: "#b45309",
    fontSize: 13,
    fontWeight: "700",
  },
  scheduleWarningText: {
    color: "#78350f",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  scheduleSwitchBtn: {
    marginTop: 10,
    backgroundColor: "#b45309",
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    alignSelf: "flex-start",
  },
  scheduleSwitchBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  tripAlertBanner: {
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  tripAlertBannerDestination: {
    backgroundColor: "#059669",
  },
  tripAlertBannerTransfer: {
    backgroundColor: "#d97706",
  },
  tripAlertBannerContent: {
    flex: 1,
  },
  tripAlertBannerTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  tripAlertBannerText: {
    color: "rgba(255, 255, 255, 0.92)",
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  rideDetailsCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#f1f7f3",
    borderWidth: 1,
    borderColor: "#d5e8dc",
  },
  rideDetailsTitle: {
    color: GREEN,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },
  rideDetailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 8,
  },
  rideDetailNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
    marginTop: 2,
  },
  rideDetailNumberText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  rideDetailText: {
    flex: 1,
  },
  rideDetailLabel: {
    color: "#212529",
    fontSize: 13,
    fontWeight: "600",
  },
  rideDetailMeta: {
    color: "#6c757d",
    fontSize: 12,
    marginTop: 2,
  },
  rideDetailVehiclePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#BAE6FD",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 4,
    alignSelf: "flex-start",
  },
  rideDetailVehicleText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0369A1",
  },
  rideDetailSayPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  rideDetailSayText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#047857",
  },
  routeCardPlacardText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0284c7",
    marginTop: 3,
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
  tripAlertBannerWrapper: {
    marginHorizontal: 14,
    marginTop: 8,
  },
  tripCollapsedContainer: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
  },
  tripCollapsedCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 8,
  },
  tripCollapsedTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tripCollapsedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tripCollapsedBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#059669",
    letterSpacing: 0.5,
  },
  tripCollapsedMeta: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  tripCollapsedTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 6,
  },
  tripCollapsedLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  originDotSmall: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  originDotInnerSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GREEN,
  },
  tripCollapsedLocationText: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "500",
    flexShrink: 1,
  },
  tripPullUpBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 10,
  },
  tripPullUpBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: GREEN,
  },
  tripExpandedModalOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    top: 70,
    zIndex: 20,
    justifyContent: "flex-end",
  },
  tripExpandedSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderBottomWidth: 0,
    overflow: "hidden",
    flex: 1,
  },
  tripSheetHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  tripSheetDragBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 8,
  },
  tripSheetHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tripSheetHeaderText: {
    flex: 1,
    marginRight: 10,
  },
  tripSheetTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  tripSheetSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 2,
  },
  tripSheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  tripSheetScroll: {
    flex: 1,
  },
  tripSheetScrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  tripSheetLocationCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
  },
  tripLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 34,
  },
  tripLocationText: {
    flex: 1,
    color: "#334155",
    fontSize: 13,
    fontWeight: "500",
  },
  tripConnector: {
    height: 8,
    width: 2,
    backgroundColor: "#CBD5E1",
    marginLeft: 9,
  },
  tripSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  tripSectionTitle: {
    color: GREEN,
    fontSize: 14,
    fontWeight: "700",
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
  tripFareLegContainer: {
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  tripFareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2,
  },
  tripFareNote: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 2,
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
  tripStepContent: {
    flex: 1,
  },
  tripStepText: {
    color: "#334155",
    fontSize: 13,
    lineHeight: 18,
  },
  tripStepVehiclePill: {
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#BAE6FD",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 4,
    alignSelf: "flex-start",
  },
  tripStepVehicleText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0369A1",
  },
  tripStepSayPill: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 4,
    alignSelf: "flex-start",
  },
  tripStepSayText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#047857",
  },
  tripLiveDistance: {
    color: "#0d47a1",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 6,
  },
  segmentCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 10,
  },
  segmentCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  segmentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  segmentBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  segmentCloseBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  segmentTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 6,
    lineHeight: 20,
  },
  segmentDetailCallout: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#BAE6FD",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 6,
  },
  segmentDetailCalloutText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0369A1",
    flex: 1,
  },
  segmentSayCallout: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  segmentSayCalloutText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#047857",
    flex: 1,
  },
  segmentChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  segmentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  segmentChipFare: {
    backgroundColor: "#E8F5E9",
    borderColor: "#C8E6C9",
  },
  segmentChipFareText: {
    fontSize: 12,
    fontWeight: "700",
    color: GREEN,
  },
  segmentChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
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
  commuterTipsCard: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
    marginBottom: 8,
  },
  commuterTipsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  commuterTipsTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#92400E",
    letterSpacing: 0.2,
  },
  commuterTipItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 4,
  },
  commuterTipBullet: {
    fontSize: 12,
    color: "#D97706",
    lineHeight: 16,
  },
  commuterTipText: {
    fontSize: 12,
    color: "#78350F",
    lineHeight: 17,
    flex: 1,
  },
  pressed: {
    opacity: 0.75,
  },
});
