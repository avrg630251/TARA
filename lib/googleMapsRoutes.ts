import * as googlePolyline from "@mapbox/polyline";

export type LatLng = { latitude: number; longitude: number };
export type PlaceSuggestion = {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
};

function getKey(): string {
  const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "Missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY. Add it to .env and enable the Directions API, Geocoding API, and Places API for this key in Google Cloud Console."
    );
  }
  return key;
}

function decodeGooglePolyline(encoded: string): LatLng[] {
  const pairs = googlePolyline.decode(encoded) as [number, number][];
  return pairs.map(([latitude, longitude]) => ({ latitude, longitude }));
}

function directionsStatusMessage(
  status: string,
  errorMessage?: string
): string {
  switch (status) {
    case "REQUEST_DENIED":
      return (
        errorMessage ??
        "Request denied. Check that Directions API is enabled and your API key restrictions allow this app."
      );
    case "OVER_QUERY_LIMIT":
      return "Route quota exceeded. Try again later.";
    case "INVALID_REQUEST":
      return errorMessage ?? "Invalid route request.";
    default:
      return errorMessage ?? `Could not get directions (${status}).`;
  }
}

export async function geocodeAddress(
  query: string
): Promise<{ lat: number; lng: number }> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("Enter a destination (address or place name).");
  }

  const key = getKey();
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", trimmed);
  url.searchParams.set("key", key);

  const res = await fetch(url.toString());
  const data = (await res.json()) as {
    status: string;
    error_message?: string;
    results?: { geometry: { location: { lat: number; lng: number } } }[];
  };

  if (data.status !== "OK" || !data.results?.[0]) {
    if (data.status === "ZERO_RESULTS") {
      throw new Error(`Could not find “${trimmed}”. Try a more specific address.`);
    }
    throw new Error(directionsStatusMessage(data.status, data.error_message));
  }

  const loc = data.results[0].geometry.location;
  return { lat: loc.lat, lng: loc.lng };
}

export async function getPlaceSuggestions(
  input: string,
  opts?: { limit?: number; locationBias?: { lat: number; lng: number } }
): Promise<PlaceSuggestion[]> {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const key = getKey();
  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", trimmed);
  url.searchParams.set("key", key);
  url.searchParams.set("language", "en");
  if (opts?.locationBias) {
    url.searchParams.set(
      "location",
      `${opts.locationBias.lat},${opts.locationBias.lng}`
    );
    url.searchParams.set("radius", "30000");
  }

  const res = await fetch(url.toString());
  const data = (await res.json()) as {
    status: string;
    error_message?: string;
    predictions?: {
      place_id: string;
      description: string;
      structured_formatting?: {
        main_text?: string;
        secondary_text?: string;
      };
    }[];
  };

  if (data.status === "ZERO_RESULTS") return [];
  if (data.status !== "OK") {
    throw new Error(directionsStatusMessage(data.status, data.error_message));
  }

  return (data.predictions ?? []).slice(0, opts?.limit ?? 3).map((p) => ({
    placeId: p.place_id,
    description: p.description,
    mainText: p.structured_formatting?.main_text ?? p.description,
    secondaryText: p.structured_formatting?.secondary_text ?? "",
  }));
}

export type RouteResult = {
  coordinates: LatLng[];
  mode: "transit" | "driving";
  summary: string;
};

/** Parsed Google transit overview for one preference / response. */
export type TransitItinerary = {
  /** Which request produced this (helps debug / dedupe). */
  routingPreference: string;
  coordinates: LatLng[];
  summary: string;
  durationSeconds: number;
  lineLabels: string[];
  boardStopName: string | null;
  alightStopName: string | null;
};

type DirectionsRouteJson = {
  summary?: string;
  overview_polyline?: { points?: string };
  legs?: {
    duration?: { value?: number };
    duration_in_traffic?: { value?: number };
    steps?: {
      travel_mode?: string;
      transit_details?: {
        departure_stop?: { name?: string };
        arrival_stop?: { name?: string };
        line?: { short_name?: string; name?: string };
      };
    }[];
  }[];
};

function parseTransitItineraryFromRoute(
  route: DirectionsRouteJson,
  routingPreference: string
): TransitItinerary | null {
  const encoded = route.overview_polyline?.points;
  if (!encoded) return null;
  const coordinates = decodeGooglePolyline(encoded);
  if (coordinates.length < 2) return null;

  let durationSeconds = 0;
  const lineLabels: string[] = [];
  let firstBoard: string | null = null;
  let lastAlight: string | null = null;

  for (const leg of route.legs ?? []) {
    durationSeconds +=
      leg.duration_in_traffic?.value ?? leg.duration?.value ?? 0;
    for (const step of leg.steps ?? []) {
      if ((step.travel_mode ?? "").toUpperCase() !== "TRANSIT") continue;
      const td = step.transit_details;
      const shortN = td?.line?.short_name?.trim();
      const longN = td?.line?.name?.trim();
      if (shortN) lineLabels.push(shortN);
      else if (longN) lineLabels.push(longN);
      const dep = td?.departure_stop?.name?.trim();
      const arr = td?.arrival_stop?.name?.trim();
      if (dep && !firstBoard) firstBoard = dep;
      if (arr) lastAlight = arr;
    }
  }

  return {
    routingPreference,
    coordinates,
    summary: route.summary ?? "",
    durationSeconds: durationSeconds || 1,
    lineLabels,
    boardStopName: firstBoard,
    alightStopName: lastAlight,
  };
}

/**
 * Ask Google for several plausible transit paths.
 * Driving returns true "alternatives"; transit usually does not — we vary
 * {@link https://developers.google.com/maps/documentation/directions/get-directions#TransitDetails transit_routing_preference}.
 */
export async function fetchTransitItinerariesFromGoogle(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<TransitItinerary[]> {
  const key = getKey();
  const prefs: { label: string; param?: string }[] = [
    { label: "default" },
    { label: "fewer_transfers", param: "fewer_transfers" },
    { label: "less_walking", param: "less_walking" },
  ];

  const results = await Promise.all(
    prefs.map(async ({ label, param }) => {
      const url = new URL(
        "https://maps.googleapis.com/maps/api/directions/json"
      );
      url.searchParams.set("origin", `${origin.lat},${origin.lng}`);
      url.searchParams.set(
        "destination",
        `${destination.lat},${destination.lng}`
      );
      url.searchParams.set("mode", "transit");
      url.searchParams.set("departure_time", "now");
      url.searchParams.set("key", key);
      if (param) {
        url.searchParams.set("transit_routing_preference", param);
      }

      try {
        const res = await fetch(url.toString());
        const data = (await res.json()) as {
          status: string;
          error_message?: string;
          routes?: DirectionsRouteJson[];
        };

        if (data.status !== "OK" || !data.routes?.[0]) return null;
        const first = data.routes[0];
        return parseTransitItineraryFromRoute(first, label);
      } catch {
        return null;
      }
    })
  );

  return results.filter((x): x is TransitItinerary => Boolean(x));
}

/**
 * Requests the fastest map path between two points.
 * Prefers driving (with alternatives) for fastest A->B guidance,
 * then falls back to transit if driving is unavailable.
 */
export async function getRouteBetween(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<RouteResult> {
  const key = getKey();

  const tryMode = async (
    mode: "transit" | "driving"
  ): Promise<RouteResult | null> => {
    const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
    url.searchParams.set("origin", `${origin.lat},${origin.lng}`);
    url.searchParams.set("destination", `${destination.lat},${destination.lng}`);
    url.searchParams.set("mode", mode);
    url.searchParams.set("key", key);
    url.searchParams.set("alternatives", "true");
    if (mode === "transit") {
      url.searchParams.set("departure_time", "now");
    } else {
      url.searchParams.set("departure_time", "now");
    }

    const res = await fetch(url.toString());
    const data = (await res.json()) as {
      status: string;
      error_message?: string;
      routes?: {
        overview_polyline: { points: string };
        summary: string;
        legs?: {
          duration?: { value?: number };
          duration_in_traffic?: { value?: number };
        }[];
      }[];
    };

    if (data.status === "OK" && data.routes?.length) {
      const ranked = [...data.routes]
        .filter((r) => Boolean(r.overview_polyline?.points))
        .map((r) => ({
          route: r,
          score:
            r.legs?.reduce((sum, leg) => {
              const bestDuration =
                leg.duration_in_traffic?.value ?? leg.duration?.value ?? 0;
              return sum + bestDuration;
            }, 0) ?? Number.POSITIVE_INFINITY,
        }))
        .sort((a, b) => a.score - b.score);

      const best = ranked[0]?.route;
      if (!best?.overview_polyline?.points) return null;

      const encoded = best.overview_polyline.points;
      return {
        coordinates: decodeGooglePolyline(encoded),
        mode,
        summary: best.summary ?? "",
      };
    }

    if (data.status === "ZERO_RESULTS") {
      return null;
    }

    throw new Error(directionsStatusMessage(data.status, data.error_message));
  };

  const driving = await tryMode("driving");
  if (driving) return driving;

  const transit = await tryMode("transit");
  if (transit) return transit;

  throw new Error(
    "No route found between these places. Check the addresses or try driving directions only."
  );
}

/** Request a road-following walking path for the short access leg to a stop. */
export async function getWalkingRouteBetween(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<LatLng[]> {
  const key = getKey();
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${origin.lat},${origin.lng}`);
  url.searchParams.set("destination", `${destination.lat},${destination.lng}`);
  url.searchParams.set("mode", "walking");
  url.searchParams.set("key", key);

  const res = await fetch(url.toString());
  const data = (await res.json()) as {
    status: string;
    error_message?: string;
    routes?: { overview_polyline?: { points?: string } }[];
  };
  const encoded = data.routes?.[0]?.overview_polyline?.points;
  if (data.status !== "OK" || !encoded) {
    throw new Error(directionsStatusMessage(data.status, data.error_message));
  }
  return decodeGooglePolyline(encoded);
}

export async function getTravelDurationSeconds(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  mode: "walking" | "driving"
): Promise<number> {
  const key = getKey();
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${origin.lat},${origin.lng}`);
  url.searchParams.set("destination", `${destination.lat},${destination.lng}`);
  url.searchParams.set("mode", mode);
  url.searchParams.set("key", key);
  const res = await fetch(url.toString());
  const data = (await res.json()) as {
    status: string;
    error_message?: string;
    routes?: { legs?: { duration?: { value?: number } }[] }[];
  };
  const seconds = data.routes?.[0]?.legs?.reduce(
    (sum, leg) => sum + (leg.duration?.value ?? 0),
    0
  );
  if (data.status !== "OK" || !seconds) {
    throw new Error(directionsStatusMessage(data.status, data.error_message));
  }
  return seconds;
}
