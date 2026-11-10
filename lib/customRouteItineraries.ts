import type { LatLng } from "@/lib/googleMapsRoutes";
import {
  STATIC_CUSTOM_POINTS,
  STATIC_CUSTOM_SEGMENTS,
} from "@/lib/customRoutesStatic";
import {
  getCachedAdminAddedRoutes,
  getCachedRouteOverride,
  getManagedRoutes,
} from "@/lib/adminAndFeedback";

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
  segment_details?: string | null;
  what_to_say?: string | null;
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

function computeNearestCustomItineraries(
  allSegments: CustomRouteSegment[],
  allPoints: CustomRoutePoint[],
  origin: LatLng
): CustomRouteResult[] {
  const firstSegmentRows = allSegments.filter(
    (segment) => segment.segment_sequence === 1
  );
  const terminals = allPoints.filter(
    (point) => point.point_type === "terminal"
  );
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

  const allPointsById = new Map(allPoints.map((p) => [p.point_id, p]));
  const results: CustomRouteResult[] = [];

  for (const nearest of nearestByItinerary) {
    let orderedSegments = allSegments
      .filter((s) => s.itinerary_id === nearest.terminal.itinerary_id)
      .sort((a, b) => a.segment_sequence - b.segment_sequence);

    if (!orderedSegments.length) continue;

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
    const destination = allPointsById.get(destinationId);
    if (!destination) continue;

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

    const override = getCachedRouteOverride(
      nearest.terminal.itinerary_id || orderedSegments[0]?.itinerary_name
    );

    if (override?.status === "suspended") {
      continue;
    }

    const computedDefaultFare = orderedSegments.reduce(
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
    );

    const effectiveFare =
      override?.customFare != null && Number.isFinite(override.customFare)
        ? Math.ceil(override.customFare)
        : computedDefaultFare;

    results.push({
      origin: nearest.terminal,
      boardingName,
      boardingCoordinate,
      destination,
      segments: orderedSegments,
      coordinates,
      fare: effectiveFare,
    });
  }

  // Also include any custom routes added by an admin that are active
  const adminAdded = getCachedAdminAddedRoutes().filter(
    (r) => r.status !== "suspended"
  );
  for (const ar of adminAdded) {
    const startLat = ar.originLat ?? origin.latitude;
    const startLng = ar.originLng ?? origin.longitude;
    const destLat = 14.670567;
    const destLng = 120.999293;
    const fareVal =
      ar.customFare != null && Number.isFinite(ar.customFare)
        ? Math.ceil(ar.customFare)
        : ar.vehicleType === "bus"
          ? 35
          : ar.vehicleType === "tricycle"
            ? 15
            : 14;

    const originPt: CustomRoutePoint = {
      point_id: `pt_orig_${ar.routeId}`,
      point_type: "terminal",
      terminal_role: "origin",
      name: ar.origin,
      instruction: ar.signboard || null,
      itinerary_id: ar.routeId,
      itinerary_name: ar.routeName,
      destination_id: `pt_dest_${ar.routeId}`,
      point_sequence: 1,
      latitude: startLat,
      longitude: startLng,
    };
    const destPt: CustomRoutePoint = {
      point_id: `pt_dest_${ar.routeId}`,
      point_type: "destination",
      terminal_role: null,
      name: ar.destination || "De La Salle Araneta University",
      instruction: null,
      itinerary_id: ar.routeId,
      itinerary_name: ar.routeName,
      destination_id: `pt_dest_${ar.routeId}`,
      point_sequence: 2,
      latitude: destLat,
      longitude: destLng,
    };
    const seg: CustomRouteSegment = {
      segment_id: `seg_${ar.routeId}_1`,
      itinerary_id: ar.routeId,
      itinerary_name: ar.routeName,
      destination_id: destPt.point_id,
      segment_sequence: 1,
      segment_type: ar.vehicleType,
      route_id: ar.routeId,
      direction_id: 0,
      from_point_id: originPt.point_id,
      to_point_id: destPt.point_id,
      segment_name:
        ar.landmarks.length > 0
          ? `${ar.origin} via ${ar.landmarks.join(" / ")} to ${ar.destination}`
          : `${ar.origin} to ${ar.destination}`,
      segment_details: ar.signboard || null,
      what_to_say: ar.whatToSay || "Para po sa DLSAU",
      coordinates: [
        [startLng, startLat],
        [destLng, destLat],
      ],
      fare: fareVal,
    };
    results.push({
      origin: originPt,
      boardingName: ar.origin,
      boardingCoordinate: { latitude: startLat, longitude: startLng },
      destination: destPt,
      segments: [seg],
      coordinates: [
        { latitude: startLat, longitude: startLng },
        { latitude: destLat, longitude: destLng },
      ],
      fare: fareVal,
    });
  }

  return results;
}

export async function fetchNearestCustomItinerary(
  origin: LatLng
): Promise<CustomRouteResult[]> {
  try {
    await getManagedRoutes();
  } catch {}
  // Rely directly on the custom DLSAU routes dataset — zero network latency, zero socket errors
  return computeNearestCustomItineraries(
    STATIC_CUSTOM_SEGMENTS as unknown as CustomRouteSegment[],
    STATIC_CUSTOM_POINTS as unknown as CustomRoutePoint[],
    origin
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
