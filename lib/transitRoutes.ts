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

const REGULAR_PER_LEG_PHP = 13;
const DISCOUNT_RATE = 0.2;

function isDiscountPassenger(code: DiscountCode): boolean {
  return code === "discounted";
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
}): FareQuote {
  const vehicleLegs = Math.max(1, (args.transferCount ?? 0) + 1);
  const regularTotal = REGULAR_PER_LEG_PHP * vehicleLegs;
  const discountedTotal = regularTotal * (1 - DISCOUNT_RATE);

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
