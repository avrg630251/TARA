import { supabase } from "@/lib/supabase";
import type { LatLng } from "@/lib/googleMapsRoutes";

export type CustomRoutePoint = {
  point_id: string;
  point_type: "terminal" | "stop" | "destination";
  terminal_role: string | null;
  name: string;
  instruction: string | null;
  itinerary_id: string | null;
  itinerary_name: string | null;
  destination_id: string;
  point_sequence: number | null;
  latitude: number;
  longitude: number;
};

export type CustomRouteSegment = {
  segment_id: string;
  itinerary_id: string;
  itinerary_name: string;
  destination_id: string;
  segment_sequence: number;
  segment_type: "walk" | "jeepney" | "tricycle" | "bus";
  route_id: string | null;
  direction_id: number | null;
  from_point_id: string;
  to_point_id: string;
  segment_name: string | null;
  coordinates: [number, number][];
  fare: number | null;
};

export type CustomRouteResult = {
  origin: CustomRoutePoint;
  boardingName: string;
  boardingCoordinate: LatLng;
  destination: CustomRoutePoint;
  segments: CustomRouteSegment[];
  coordinates: LatLng[];
  fare: number | null;
};

export async function fetchNearestCustomItinerary(
  origin: LatLng
): Promise<CustomRouteResult[]> {
  const [firstSegmentsRes, pointsRes] = await Promise.all([
    supabase
      .from("custom_route_segments")
      .select("*")
      .eq("segment_sequence", 1),
    supabase
      .from("custom_route_points")
      .select("*")
      .eq("point_type", "terminal"),
  ]);

  if (firstSegmentsRes.error) {
    console.error("[TARA] Error fetching first custom route segments:", firstSegmentsRes.error);
    throw new Error(firstSegmentsRes.error.message);
  }
  if (pointsRes.error) {
    console.error("[TARA] Error fetching custom route terminals:", pointsRes.error);
    throw new Error(pointsRes.error.message);
  }

  const firstSegmentRows = (firstSegmentsRes.data ?? []) as CustomRouteSegment[];
  const terminals = (pointsRes.data ?? []) as CustomRoutePoint[];

  if (!firstSegmentRows.length || !terminals.length) {
    console.warn("[TARA] No firstSegments or terminals found in database");
    return [];
  }

  const pointById = new Map(terminals.map((point) => [point.point_id, point]));
  const candidates = firstSegmentRows
    .map((segment) => {
      const terminal = pointById.get(segment.from_point_id);
      if (!terminal) return null;
      const nearestLineIndex =
        segment.segment_type === "jeepney"
          ? nearestCoordinateIndex(origin, segment.coordinates)
          : -1;
      return {
        segment,
        terminal,
        distance:
          nearestLineIndex >= 0
            ? distanceToCoordinate(
                origin,
                segment.coordinates[nearestLineIndex]
              )
            : distanceMeters(origin, terminal),
        nearestLineIndex,
      };
    })
    .filter(
      (
        candidate
      ): candidate is {
        segment: CustomRouteSegment;
        terminal: CustomRoutePoint;
        distance: number;
        nearestLineIndex: number;
      } => candidate !== null
    );
  const nearestByItinerary = candidates
    .filter((candidate) => candidate.terminal.itinerary_id)
    .sort((a, b) => a.distance - b.distance)
    .filter(
      (candidate, index, all) =>
        all.findIndex(
          (other) =>
            other.terminal.itinerary_id === candidate.terminal.itinerary_id
        ) === index
    )
    .slice(0, 2);

  if (!nearestByItinerary.length) {
    console.warn("[TARA] No nearest itineraries found among candidates");
    return [];
  }

  const itineraryResults = await Promise.all(
    nearestByItinerary.map(async (nearest): Promise<CustomRouteResult | null> => {
      const { data: segments, error: segmentsError } = await supabase
        .from("custom_route_segments")
        .select("*")
        .eq("itinerary_id", nearest.terminal.itinerary_id!)
        .order("segment_sequence", { ascending: true });
      if (segmentsError) {
        console.error(
          "[TARA] Error fetching segments for itinerary:",
          nearest.terminal.itinerary_id,
          segmentsError
        );
        throw new Error(segmentsError.message);
      }

      let orderedSegments = (segments ?? []) as CustomRouteSegment[];
      if (!orderedSegments.length) return null;

      let boardingName = nearest.terminal.name;
      let boardingCoordinate: LatLng = {
        latitude: nearest.terminal.latitude,
        longitude: nearest.terminal.longitude,
      };
      if (
        nearest.segment.segment_type === "jeepney" &&
        nearest.nearestLineIndex >= 0
      ) {
        boardingName = "Nearest point along the jeepney route";
        const [longitude, latitude] =
          nearest.segment.coordinates[nearest.nearestLineIndex];
        boardingCoordinate = { latitude, longitude };
        const first = orderedSegments[0];
        orderedSegments = [
          {
            ...first,
            coordinates: first.coordinates.slice(nearest.nearestLineIndex),
          },
          ...orderedSegments.slice(1),
        ];
      }

      const destinationId =
        orderedSegments[orderedSegments.length - 1].destination_id;
      const { data: destination, error: destinationError } = await supabase
        .from("custom_route_points")
        .select("*")
        .eq("point_id", destinationId)
        .single();
      if (destinationError) {
        console.error(
          "[TARA] Error fetching destination point:",
          destinationId,
          destinationError
        );
        throw new Error(destinationError.message);
      }

      const coordinates: LatLng[] = [];
      for (const segment of orderedSegments) {
        const segmentCoordinates = segment.coordinates
          .filter(
            (coordinate): coordinate is [number, number] =>
              Array.isArray(coordinate) &&
              coordinate.length >= 2 &&
              Number.isFinite(Number(coordinate[0])) &&
              Number.isFinite(Number(coordinate[1]))
          )
          .map(([longitude, latitude]) => ({
            latitude: Number(latitude),
            longitude: Number(longitude),
          }));
        coordinates.push(
          ...(coordinates.length ? segmentCoordinates.slice(1) : segmentCoordinates)
        );
      }

      return {
        origin: nearest.terminal,
        boardingName,
        boardingCoordinate,
        destination: destination as CustomRoutePoint,
        segments: orderedSegments,
        coordinates,
        fare: orderedSegments.reduce(
          (total, segment) => {
            if (segment.segment_type === "walk") return total;
            const legFare =
              segment.fare ??
              (segment.segment_type === "tricycle"
                ? 15
                : segment.segment_type === "bus"
                  ? 35
                  : 14);
            return total + Math.ceil(legFare);
          },
          0
        ),
      };
    })
  );

  return itineraryResults.filter(
    (result): result is CustomRouteResult => result !== null
  );
}

function distanceMeters(
  a: LatLng,
  b: Pick<CustomRoutePoint, "latitude" | "longitude">
): number {
  return distanceToCoordinate(a, [b.longitude, b.latitude]);
}

function distanceToCoordinate(
  a: LatLng,
  coordinate: [number, number]
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const [longitude, latitude] = coordinate;
  const dLat = toRadians(latitude - a.latitude);
  const dLng = toRadians(longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function nearestCoordinateIndex(
  origin: LatLng,
  coordinates: [number, number][]
): number {
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  coordinates.forEach((coordinate, index) => {
    const distance = distanceToCoordinate(origin, coordinate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}
