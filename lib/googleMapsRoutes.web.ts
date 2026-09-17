import { loadGoogleMapsApi } from "@/lib/googleMapsWebLoader";

export type LatLng = { latitude: number; longitude: number };
export type PlaceSuggestion = {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
};

export type RouteResult = {
  coordinates: LatLng[];
  mode: "transit" | "driving";
  summary: string;
};

export type TransitItinerary = {
  routingPreference: string;
  coordinates: LatLng[];
  summary: string;
  durationSeconds: number;
  lineLabels: string[];
  boardStopName: string | null;
  alightStopName: string | null;
};

function directionsStatusMessage(status: string): string {
  switch (status) {
    case "REQUEST_DENIED":
      return "Request denied. Check Maps API key restrictions and enabled APIs.";
    case "OVER_QUERY_LIMIT":
      return "Route quota exceeded. Try again later.";
    case "INVALID_REQUEST":
      return "Invalid route request.";
    default:
      return `Could not get directions (${status}).`;
  }
}

type GoogleTransitPref = "default" | "fewer_transfers" | "less_walking";

function parseTransitRoute(route: any, routingPreference: string): TransitItinerary | null {
  const overviewPath: any[] = route?.overview_path ?? [];
  if (!overviewPath.length) return null;
  const coordinates: LatLng[] = overviewPath.map((pt) => ({
    latitude: Number(pt.lat()),
    longitude: Number(pt.lng()),
  }));
  if (coordinates.length < 2) return null;

  let durationSeconds = 0;
  const lineLabels: string[] = [];
  let boardStopName: string | null = null;
  let alightStopName: string | null = null;

  for (const leg of route?.legs ?? []) {
    durationSeconds += Number(
      leg?.duration_in_traffic?.value ?? leg?.duration?.value ?? 0
    );
    for (const step of leg?.steps ?? []) {
      if ((step?.travel_mode ?? "").toUpperCase() !== "TRANSIT") continue;
      const td = step?.transit?.line ? step?.transit : step?.transit_details;
      const shortN = td?.line?.short_name?.trim();
      const longN = td?.line?.name?.trim();
      if (shortN) lineLabels.push(shortN);
      else if (longN) lineLabels.push(longN);
      const dep = td?.departure_stop?.name?.trim();
      const arr = td?.arrival_stop?.name?.trim();
      if (dep && !boardStopName) boardStopName = dep;
      if (arr) alightStopName = arr;
    }
  }

  return {
    routingPreference,
    coordinates,
    summary: route?.summary ?? "",
    durationSeconds: durationSeconds || 1,
    lineLabels,
    boardStopName,
    alightStopName,
  };
}

export async function geocodeAddress(
  query: string
): Promise<{ lat: number; lng: number }> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("Enter a destination (address or place name).");
  }
  await loadGoogleMapsApi();
  const g = (window as any).google;

  return new Promise((resolve, reject) => {
    const geocoder = new g.maps.Geocoder();
    geocoder.geocode({ address: trimmed }, (results: any[], status: string) => {
      if (status !== "OK" || !results?.[0]) {
        if (status === "ZERO_RESULTS") {
          reject(new Error(`Could not find "${trimmed}". Try a more specific address.`));
          return;
        }
        reject(new Error(`Geocoding failed: ${status}`));
        return;
      }
      const loc = results[0].geometry.location;
      resolve({ lat: Number(loc.lat()), lng: Number(loc.lng()) });
    });
  });
}

export async function getPlaceSuggestions(
  input: string,
  opts?: { limit?: number; locationBias?: { lat: number; lng: number } }
): Promise<PlaceSuggestion[]> {
  const trimmed = input.trim();
  if (!trimmed) return [];
  await loadGoogleMapsApi();
  const g = (window as any).google;

  return new Promise((resolve, reject) => {
    const service = new g.maps.places.AutocompleteService();
    const request: any = {
      input: trimmed,
      types: ["geocode", "establishment"],
    };
    if (opts?.locationBias) {
      request.locationBias = {
        center: { lat: opts.locationBias.lat, lng: opts.locationBias.lng },
        radius: 30000,
      };
    }
    service.getPlacePredictions(
      request,
      (predictions: any[], status: string) => {
        if (status === g.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
          resolve([]);
          return;
        }
        if (status !== g.maps.places.PlacesServiceStatus.OK) {
          reject(new Error(`Suggestions failed: ${status}`));
          return;
        }
        resolve(
          (predictions ?? []).slice(0, opts?.limit ?? 3).map((p: any) => ({
            placeId: p.place_id,
            description: p.description,
            mainText: p.structured_formatting?.main_text ?? p.description,
            secondaryText: p.structured_formatting?.secondary_text ?? "",
          }))
        );
      }
    );
  });
}

async function routeWithGoogleMaps(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  mode: "transit" | "driving" | "walking",
  routingPreference?: GoogleTransitPref
): Promise<any[]> {
  await loadGoogleMapsApi();
  const g = (window as any).google;
  return new Promise((resolve, reject) => {
    const ds = new g.maps.DirectionsService();
    const req: any = {
      origin: { lat: origin.lat, lng: origin.lng },
      destination: { lat: destination.lat, lng: destination.lng },
      travelMode:
        mode === "driving"
          ? g.maps.TravelMode.DRIVING
          : mode === "walking"
            ? g.maps.TravelMode.WALKING
            : g.maps.TravelMode.TRANSIT,
      provideRouteAlternatives: mode === "driving",
      drivingOptions:
        mode === "driving"
          ? { departureTime: new Date(), trafficModel: "bestguess" }
          : undefined,
      transitOptions:
        mode === "transit"
          ? {
              departureTime: new Date(),
              routingPreference:
                routingPreference === "fewer_transfers"
                  ? g.maps.TransitRoutePreference.FEWER_TRANSFERS
                  : routingPreference === "less_walking"
                    ? g.maps.TransitRoutePreference.LESS_WALKING
                    : undefined,
            }
          : undefined,
    };
    ds.route(req, (result: any, status: string) => {
      if (status === "OK" && result?.routes?.length) {
        resolve(result.routes);
        return;
      }
      if (status === "ZERO_RESULTS") {
        resolve([]);
        return;
      }
      reject(new Error(directionsStatusMessage(status)));
    });
  });
}

export async function fetchTransitItinerariesFromGoogle(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<TransitItinerary[]> {
  const prefs: GoogleTransitPref[] = [
    "default",
    "fewer_transfers",
    "less_walking",
  ];
  const output: TransitItinerary[] = [];
  for (const pref of prefs) {
    try {
      const routes = await routeWithGoogleMaps(origin, destination, "transit", pref);
      const first = routes[0];
      const parsed = first ? parseTransitRoute(first, pref) : null;
      if (parsed) output.push(parsed);
    } catch {
      // Continue; match native behavior tolerance.
    }
  }
  return output;
}

export async function getRouteBetween(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<RouteResult> {
  const drivingRoutes = await routeWithGoogleMaps(origin, destination, "driving");
  if (drivingRoutes.length) {
    const ranked = [...drivingRoutes].sort((a, b) => {
      const aSec =
        (a?.legs ?? []).reduce(
          (sum: number, leg: any) =>
            sum + Number(leg?.duration_in_traffic?.value ?? leg?.duration?.value ?? 0),
          0
        ) || Number.POSITIVE_INFINITY;
      const bSec =
        (b?.legs ?? []).reduce(
          (sum: number, leg: any) =>
            sum + Number(leg?.duration_in_traffic?.value ?? leg?.duration?.value ?? 0),
          0
        ) || Number.POSITIVE_INFINITY;
      return aSec - bSec;
    });
    const best = ranked[0];
    const coordinates: LatLng[] = (best?.overview_path ?? []).map((pt: any) => ({
      latitude: Number(pt.lat()),
      longitude: Number(pt.lng()),
    }));
    if (coordinates.length > 1) {
      return {
        coordinates,
        mode: "driving",
        summary: best?.summary ?? "",
      };
    }

  }

  const transitRoutes = await routeWithGoogleMaps(origin, destination, "transit");
  const firstTransit = transitRoutes[0];
  const parsed = firstTransit ? parseTransitRoute(firstTransit, "default") : null;
  if (parsed) {
    return {
      coordinates: parsed.coordinates,
      mode: "transit",
      summary: parsed.summary,
    };
  }
  throw new Error(
    "No route found between these places. Check the addresses or try driving directions only."
  );
}

export async function getWalkingRouteBetween(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<LatLng[]> {
  const routes = await routeWithGoogleMaps(origin, destination, "walking");
  const path: any[] = routes[0]?.overview_path ?? [];
  const coordinates = path.map((point) => ({
    latitude: Number(point.lat()),
    longitude: Number(point.lng()),
  }));
  if (coordinates.length < 2) {
    throw new Error("No walking route found to the boarding point.");
  }
  return coordinates;
}

export async function getTravelDurationSeconds(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  mode: "walking" | "driving"
): Promise<number> {
  const routes = await routeWithGoogleMaps(origin, destination, mode);
  const seconds = (routes[0]?.legs ?? []).reduce(
    (sum: number, leg: any) => sum + Number(leg?.duration?.value ?? 0),
    0
  );
  if (!seconds) {
    throw new Error("Could not calculate walking time to the boarding point.");
  }
  return seconds;
}
