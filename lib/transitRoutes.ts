import { supabase } from "@/lib/supabase";
import type { LatLng } from "@/lib/googleMapsRoutes";

export type DiscountCode = "regular" | "discounted";

export type TransitRouteRecord = {
  route_id: string;
  route_long_name: string | null;
  route_desc?: string | null;
  route_type?: number | null;
  origin_text?: string | null;
  destination_text?: string | null;
  possible_trip_count?: number | null;
  nearest_origin_stop?: string | null;
  nearest_destination_stop?: string | null;
  shape_match_count?: number | null;
  transfer_count?: number | null;
  eta_minutes?: number | null;
  generalized_cost_minutes?: number | null;
  shape_id?: string | null;
  geometry?: LatLng[] | null;
};

export async function fetchGtfsRoutesBetweenPoints(args: {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
  stopRadiusMeters: number;
}): Promise<TransitRouteRecord[]> {
  const { data, error } = await supabase.rpc("find_route_options_between_points", {
    p_origin_lat: args.originLat,
    p_origin_lng: args.originLng,
    p_dest_lat: args.destinationLat,
    p_dest_lng: args.destinationLng,
    p_stop_radius_m: args.stopRadiusMeters,
    p_transfer_penalty_min: 10,
    p_walk_meters_per_minute: 75,
    p_walk_weight: 1.2,
  });

  if (error) throw new Error(error.message);
  return (data ?? []) as TransitRouteRecord[];
}

export async function fetchGtfsRoutesByShape(args: {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
  shapeRadiusMeters: number;
}): Promise<TransitRouteRecord[]> {
  const { data, error } = await supabase.rpc("find_routes_near_points_by_shape", {
    p_origin_lat: args.originLat,
    p_origin_lng: args.originLng,
    p_dest_lat: args.destinationLat,
    p_dest_lng: args.destinationLng,
    p_shape_radius_m: args.shapeRadiusMeters,
  });

  if (error) throw new Error(error.message);
  return (data ?? []) as TransitRouteRecord[];
}

export async function fetchGtfsRoutesWithGeometry(args: {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
  shapeRadiusMeters: number;
}): Promise<TransitRouteRecord[]> {
  const { data, error } = await supabase.rpc(
    "find_routes_near_points_with_geometry",
    {
      p_origin_lat: args.originLat,
      p_origin_lng: args.originLng,
      p_dest_lat: args.destinationLat,
      p_dest_lng: args.destinationLng,
      p_shape_radius_m: args.shapeRadiusMeters,
    }
  );

  if (error) throw new Error(error.message);
  return (data ?? []) as TransitRouteRecord[];
}

export type FareQuote = {
  routeId: string;
  originalFare: number;
  discountAmount: number;
  finalFare: number;
  currency: string;
};

export const JEEPNEY_BASE_FARE_PHP = 14;
export const JEEPNEY_BASE_KM = 4;
export const JEEPNEY_SUCCEEDING_PER_KM_PHP = 2;

export const TRICYCLE_SHARED_FARE_PHP = 15;
export const TRICYCLE_SOLO_FARE_PHP = 50;
export const BUS_BASE_FARE_PHP = 35;

const REGULAR_PER_LEG_PHP = 14;
const DISCOUNT_RATE = 0.2;

function isDiscountPassenger(code: DiscountCode): boolean {
  return code === "discounted";
}

/**
 * Calculates Jeepney fare based on distance in meters:
 * - 14 base fare for first 4 kilometers
 * - Additional 2 for succeeding kilometers
 * - If the distance does not reach 5 kilometers, keeps it at 14
 */
export function computeJeepneyFare(distanceMeters: number): number {
  const distanceKm = distanceMeters / 1000;
  if (distanceKm < 5) {
    return JEEPNEY_BASE_FARE_PHP;
  }
  const succeedingKm = Math.floor(distanceKm - 4);
  return JEEPNEY_BASE_FARE_PHP + succeedingKm * JEEPNEY_SUCCEEDING_PER_KM_PHP;
}

export function formatTricycleFareText(): string {
  return "₱15 shared · ₱50 solo";
}

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDlat = Math.sin(dLat / 2);
  const sinDlng = Math.sin(dLng / 2);
  const val =
    sinDlat * sinDlat + Math.cos(lat1) * Math.cos(lat2) * sinDlng * sinDlng;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(val)));
}

export function polylineDistanceMeters(points: LatLng[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += haversineMeters(
      { lat: points[index - 1].latitude, lng: points[index - 1].longitude },
      { lat: points[index].latitude, lng: points[index].longitude }
    );
  }
  return total;
}

export type NormalizeTravelFareArgs = {
  routeName?: string;
  originLabel?: string;
  destinationLabel?: string;
  boardStop?: string;
  offStop?: string;
  fareText?: string;
  fareValue?: number | null;
  segments?: Array<{
    segmentType: string;
    coordinates?: LatLng[];
    fare?: number | null;
  }>;
  polyline?: LatLng[];
  vehicleType?: "jeepney" | "bus";
  discountCode?: DiscountCode;
};

/**
 * Normalizes travel fares for stored bookmarks and history items:
 * - Computes only for vehicular transit segments that the commuter rode on (walk = ₱0)
 * - If route has tricycle segments, indicates BOTH shared AND solo/special fare (e.g. "₱15 shared · ₱50 solo")
 * - Solo/special trips for tricycle segments are strictly EXCLUDED from discounts
 * - Bus: "Php 35.00" (35 PHP base fare)
 * - Jeepney: ₱14 base fare (< 5km) + ₱2/km succeeding starting at 5 km
 * - All fares are rounded up (Math.ceil)
 */
export function normalizeTravelFare(item: NormalizeTravelFareArgs): {
  fareText: string;
  fareValue: number;
} {
  const isDiscounted = item.discountCode === "discounted";
  const textHaystack = `${item.routeName ?? ""} ${item.originLabel ?? ""} ${item.destinationLabel ?? ""} ${item.boardStop ?? ""} ${item.offStop ?? ""} ${item.fareText ?? ""}`.toLowerCase();

  const hasTrikeInSegments = item.segments?.some((s) => s.segmentType === "tricycle");
  const mentionsTrike =
    hasTrikeInSegments ||
    textHaystack.includes("tricycle") ||
    textHaystack.includes("trike") ||
    textHaystack.includes("shared") ||
    textHaystack.includes("solo") ||
    textHaystack.includes("special");

  // 1. If segments are present, compute accurately from transit legs (exclude walk)
  if (item.segments && item.segments.length > 0) {
    const transitSegments = item.segments.filter((s) => s.segmentType !== "walk");
    if (transitSegments.length > 0) {
      const hasTrike = transitSegments.some((s) => s.segmentType === "tricycle");

      const sharedTotal = Math.ceil(
        transitSegments.reduce((sum, s) => {
          if (s.segmentType === "tricycle") {
            return (
              sum +
              (isDiscounted
                ? Math.ceil(TRICYCLE_SHARED_FARE_PHP * 0.8)
                : TRICYCLE_SHARED_FARE_PHP)
            );
          }
          if (s.segmentType === "bus") {
            return (
              sum +
              (isDiscounted
                ? Math.ceil(BUS_BASE_FARE_PHP * 0.8)
                : BUS_BASE_FARE_PHP)
            );
          }
          const dist = s.coordinates?.length
            ? polylineDistanceMeters(s.coordinates)
            : 0;
          const baseFare = computeJeepneyFare(dist);
          return sum + (isDiscounted ? Math.ceil(baseFare * 0.8) : baseFare);
        }, 0)
      );

      if (hasTrike) {
        // Solo/special trips for tricycle segments are strictly EXCLUDED from the discount!
        const soloTotal = Math.ceil(
          transitSegments.reduce((sum, s) => {
            if (s.segmentType === "tricycle") {
              return sum + TRICYCLE_SOLO_FARE_PHP; // Always ₱50, no discount!
            }
            if (s.segmentType === "bus") {
              return (
                sum +
                (isDiscounted
                  ? Math.ceil(BUS_BASE_FARE_PHP * 0.8)
                  : BUS_BASE_FARE_PHP)
              );
            }
            const dist = s.coordinates?.length
              ? polylineDistanceMeters(s.coordinates)
              : 0;
            const baseFare = computeJeepneyFare(dist);
            return sum + (isDiscounted ? Math.ceil(baseFare * 0.8) : baseFare);
          }, 0)
        );
        return {
          fareText: `₱${sharedTotal} shared · ₱${soloTotal} solo`,
          fareValue: sharedTotal,
        };
      }

      return {
        fareText: `Php ${sharedTotal.toFixed(2)}`,
        fareValue: sharedTotal,
      };
    }
  }

  // 2. If it mentions tricycle or trike or shared/solo (without full segments):
  if (mentionsTrike) {
    // If fareText already contains both shared and solo (e.g. "₱29 shared · ₱64 solo" or "₱15 shared · ₱50 solo"):
    const sharedSoloMatch = item.fareText?.match(
      /(?:₱|Php)?\s*(\d+(?:\.\d+)?)\s*shared[^\d]*(?:₱|Php)?\s*(\d+(?:\.\d+)?)\s*(?:solo|special)/i
    );
    if (sharedSoloMatch) {
      const parsedShared = Math.ceil(parseFloat(sharedSoloMatch[1]));
      let parsedSolo = Math.ceil(parseFloat(sharedSoloMatch[2]));
      if (parsedSolo < TRICYCLE_SOLO_FARE_PHP) {
        parsedSolo = TRICYCLE_SOLO_FARE_PHP;
      }
      return {
        fareText: `₱${parsedShared} shared · ₱${parsedSolo} solo`,
        fareValue: parsedShared,
      };
    }

    // If only numeric value was known (e.g. fareValue: 15 or fareText: "Php 15.00" or "Php 29.00"):
    let parsedShared: number | null = null;
    if (typeof item.fareValue === "number" && Number.isFinite(item.fareValue)) {
      parsedShared = Math.ceil(item.fareValue);
    } else if (item.fareText) {
      const match = item.fareText.match(/(?:₱|PHP|Php)?\s*([0-9]+(?:\.[0-9]+)?)/i);
      if (match) {
        parsedShared = Math.ceil(parseFloat(match[1]));
      }
    }

    const defaultShared = isDiscounted
      ? Math.ceil(TRICYCLE_SHARED_FARE_PHP * 0.8)
      : TRICYCLE_SHARED_FARE_PHP;
    const finalShared =
      parsedShared != null && parsedShared > 0 ? parsedShared : defaultShared;

    // Solo/special trips for tricycle segments are excluded from discount (always ₱50 for the trike portion).
    // If the trip had other legs (e.g. finalShared > 15), non-trike portion is finalShared - defaultShared:
    const otherLegsCost = Math.max(0, finalShared - defaultShared);
    const finalSolo = otherLegsCost + TRICYCLE_SOLO_FARE_PHP;

    return {
      fareText: `₱${finalShared} shared · ₱${finalSolo} solo`,
      fareValue: finalShared,
    };
  }

  // 3. Bus
  if (item.vehicleType === "bus" || textHaystack.includes("bus")) {
    const defaultBus = isDiscounted
      ? Math.ceil(BUS_BASE_FARE_PHP * 0.8)
      : BUS_BASE_FARE_PHP;
    const busFare =
      item.fareValue != null && item.fareValue >= defaultBus
        ? Math.ceil(item.fareValue)
        : defaultBus;
    return {
      fareText: `Php ${busFare.toFixed(2)}`,
      fareValue: busFare,
    };
  }

  // 4. If existing fareValue or numeric fareText is present (Jeepney / general transit)
  let parsedValue: number | null = null;
  if (typeof item.fareValue === "number" && Number.isFinite(item.fareValue)) {
    parsedValue = Math.ceil(item.fareValue);
  } else if (item.fareText) {
    const match = item.fareText.match(/(?:₱|PHP|Php)?\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (match) {
      parsedValue = Math.ceil(parseFloat(match[1]));
    }
  }

  if (parsedValue != null) {
    let finalVal = parsedValue;
    if (finalVal === 13) {
      finalVal = JEEPNEY_BASE_FARE_PHP;
    } else if (finalVal < 12) {
      finalVal = isDiscounted
        ? Math.ceil(JEEPNEY_BASE_FARE_PHP * 0.8)
        : JEEPNEY_BASE_FARE_PHP;
    }
    return {
      fareText: `Php ${finalVal.toFixed(2)}`,
      fareValue: finalVal,
    };
  }

  // 5. Jeepney with polyline distance
  if (item.polyline && item.polyline.length >= 2) {
    const distMeters = polylineDistanceMeters(item.polyline);
    const jFare = computeJeepneyFare(distMeters);
    const finalJFare = Math.ceil(isDiscounted ? jFare * 0.8 : jFare);
    return {
      fareText: `Php ${finalJFare.toFixed(2)}`,
      fareValue: finalJFare,
    };
  }

  // Default jeepney base fare
  const defaultBase = isDiscounted
    ? Math.ceil(JEEPNEY_BASE_FARE_PHP * 0.8)
    : JEEPNEY_BASE_FARE_PHP;
  return {
    fareText: `Php ${defaultBase.toFixed(2)}`,
    fareValue: defaultBase,
  };
}

/**
 * A discounted passenger pays 20% less than the regular fare.
 * A direct trip has 1 leg; each transfer adds one leg (= transfer_count + 1).
 */
export function computeFlatFareForTrip(args: {
  transferCount?: number | null;
  discountCode: DiscountCode;
  /** Optional stable id for FareQuote.routeId */
  logicalRouteKey?: string;
  distanceMeters?: number | null;
  vehicleType?: "jeepney" | "bus";
}): FareQuote {
  const vehicleLegs = Math.max(1, (args.transferCount ?? 0) + 1);
  const perLegBase = args.vehicleType === "bus" ? BUS_BASE_FARE_PHP : REGULAR_PER_LEG_PHP;
  const distanceFare =
    args.vehicleType === "bus"
      ? BUS_BASE_FARE_PHP * vehicleLegs
      : args.distanceMeters != null && args.distanceMeters > 0
        ? computeJeepneyFare(args.distanceMeters)
        : REGULAR_PER_LEG_PHP * vehicleLegs;
  const regularTotal = Math.ceil(Math.max(perLegBase * vehicleLegs, distanceFare));
  const discountedTotal = Math.ceil(regularTotal * (1 - DISCOUNT_RATE));

  const useDiscount = isDiscountPassenger(args.discountCode);
  const finalFare = useDiscount ? discountedTotal : regularTotal;
  const originalFare = regularTotal;

  return {
    routeId: args.logicalRouteKey ?? "",
    originalFare,
    discountAmount: originalFare - finalFare,
    finalFare,
    currency: "PHP",
  };
}
