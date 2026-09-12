import type { LatLng, TransitItinerary } from "@/lib/googleMapsRoutes";
import type { TransitRouteRecord } from "@/lib/transitRoutes";

export type DisplayRoutePlan = {
  id: string;
  /** Short label for the map / card title (lines or DB route name). */
  routeName: string;
  transfersText: string;
  estimatedText: string;
  fareText: string;
  scoreText?: string;
  /** Board / alight only for chips (no long description). */
  boardStop: string;
  offStop: string;
  etaMinutes?: number | null;
  fareValue?: number | null;
  generalizedCost?: number | null;
  transferCount?: number | null;
  /** Google path for this option (may be shared with another option). */
  polyline: LatLng[];
  /** True when Google returned this distinct itinerary. */
  fromGoogle: boolean;
  googleSummary?: string;
  /** Matched GTFS row when found. */
  dbRouteId?: string;
  customFareValue?: number | null;
  segments?: DisplayRouteSegment[];
  boardingCoordinate?: LatLng;
};

export type DisplayRouteSegment = {
  segmentId: string;
  segmentType: "walk" | "jeepney" | "tricycle" | "bus";
  coordinates: LatLng[];
  label?: string | null;
  routeId?: string | null;
  fare?: number | null;
  durationMinutes?: number | null;
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s]/gi, "")
    .trim();
}

function tokenizeRouteName(name: string | null | undefined): string[] {
  if (!name) return [];
  return norm(name)
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/** How well Google line labels match a GTFS route name (0+). */
export function googleDbLineOverlap(
  lineLabels: string[],
  routeLongName: string | null | undefined
): number {
  if (!lineLabels.length || !routeLongName) return 0;
  const n = norm(routeLongName);
  let score = 0;
  for (const raw of lineLabels) {
    const t = norm(raw);
    if (t.length < 2) continue;
    if (n.includes(t) || t.includes(n)) {
      score += 3;
      continue;
    }
    for (const tok of tokenizeRouteName(routeLongName)) {
      if (tok.length >= 3 && (n.includes(tok) || t.includes(tok))) score += 1;
    }
  }
  return score;
}

/** Average min distance (m) from sampled points on a to b — lower = more similar. */
export function polylineDissimilarityMeters(a: LatLng[], b: LatLng[]): number {
  if (a.length < 2 || b.length < 2) return Number.POSITIVE_INFINITY;
  const samples = 24;
  const pick = (poly: LatLng[]) => {
    const out: LatLng[] = [];
    for (let i = 0; i < samples; i++) {
      const t = i / Math.max(1, samples - 1);
      const idx = Math.min(
        poly.length - 1,
        Math.round(t * (poly.length - 1))
      );
      out.push(poly[idx]);
    }
    return out;
  };
  const haversine = (p: LatLng, q: LatLng) => {
    const R = 6371000;
    const toR = (d: number) => (d * Math.PI) / 180;
    const dLat = toR(q.latitude - p.latitude);
    const dLon = toR(q.longitude - p.longitude);
    const la1 = toR(p.latitude);
    const la2 = toR(q.latitude);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  };
  const pa = pick(a);
  const pb = pick(b);
  let sum = 0;
  for (const p of pa) {
    let minD = Number.POSITIVE_INFINITY;
    for (const q of pb) minD = Math.min(minD, haversine(p, q));
    sum += minD;
  }
  return sum / pa.length;
}

/**
 * Drop itineraries whose path is almost the same as an earlier one (keeps faster).
 */
export function dedupeItinerariesByShape(
  items: TransitItinerary[],
  maxSimilarityMeters = 320
): TransitItinerary[] {
  const out: TransitItinerary[] = [];
  for (const it of items) {
    if (it.coordinates.length < 2) continue;
    const dup = out.some(
      (o) =>
        polylineDissimilarityMeters(o.coordinates, it.coordinates) <
        maxSimilarityMeters
    );
    if (!dup) out.push(it);
  }
  return out;
}

function buildDbOnlyPlans(
  dbRoutes: TransitRouteRecord[],
  limit: number
): DisplayRoutePlan[] {
  const ranked = [...dbRoutes].sort((a, b) => {
    const ca = a.generalized_cost_minutes ?? Number(a.eta_minutes ?? 99999);
    const cb = b.generalized_cost_minutes ?? Number(b.eta_minutes ?? 99999);
    return ca - cb;
  });

  const plans: DisplayRoutePlan[] = [];
  for (const db of ranked) {
    if (plans.length >= limit) break;
    if (!db.geometry || db.geometry.length < 2) continue;
    const etaMin = db.eta_minutes != null ? Number(db.eta_minutes) : null;
    plans.push({
      id: `db:${db.route_id}:${plans.length}`,
      routeName: db.route_long_name ?? "Route",
      transfersText:
        db.transfer_count != null ? `${db.transfer_count}` : "—",
      estimatedText:
        etaMin != null && Number.isFinite(etaMin)
          ? `${Math.round(etaMin)} min`
          : "—",
      fareText: "—",
      scoreText:
        db.generalized_cost_minutes != null
          ? `${db.generalized_cost_minutes.toFixed(2)}`
          : undefined,
      boardStop: db.nearest_origin_stop?.trim() || "—",
      offStop: db.nearest_destination_stop?.trim() || "—",
      etaMinutes: etaMin,
      fareValue: null,
      generalizedCost: db.generalized_cost_minutes ?? null,
      transferCount: db.transfer_count ?? null,
      polyline: db.geometry,
      fromGoogle: false,
      dbRouteId: db.route_id,
    });
  }
  return plans;
}

/**
 * Build up to `limit` options from routes that have drawable geometry.
 *
 * GTFS rows are useful for matching names, fares, and timing, but they do not
 * include a path in this client. They must not become separate map options by
 * reusing another route's polyline.
 */
export function composeTransitPlanOptions(args: {
  itineraries: TransitItinerary[];
  dbRoutes: TransitRouteRecord[];
  /** Used when itineraries are empty — e.g. driving/transit overview from getRouteBetween. */
  fallbackPolyline?: LatLng[];
  limit?: number;
}): DisplayRoutePlan[] {
  const limit = args.limit ?? 3;
  const deduped = dedupeItinerariesByShape([...args.itineraries]);
  deduped.sort((a, b) => a.durationSeconds - b.durationSeconds);

  if (!deduped.length && args.dbRoutes.length) {
    return buildDbOnlyPlans(args.dbRoutes, limit);
  }

  const usedDbKeys = new Set<string>();
  const plans: DisplayRoutePlan[] = [];

  const pickDbForItin = (itin: TransitItinerary) => {
    const scored = [...args.dbRoutes]
      .filter((r) => !usedDbKeys.has(r.route_id))
      .map((r) => ({
        r,
        score: googleDbLineOverlap(itin.lineLabels, r.route_long_name),
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const ea = a.r.eta_minutes ?? 9999;
        const eb = b.r.eta_minutes ?? 9999;
        return ea - eb;
      });
    return scored[0]?.r ?? null;
  };

  for (const itin of deduped) {
    if (plans.length >= limit) break;
    const db = pickDbForItin(itin);
    if (db) usedDbKeys.add(db.route_id);

    const board =
      itin.boardStopName?.trim() ||
      db?.nearest_origin_stop?.trim() ||
      "—";
    const off =
      itin.alightStopName?.trim() ||
      db?.nearest_destination_stop?.trim() ||
      "—";

    const lineTitle =
      itin.lineLabels.length > 0
        ? itin.lineLabels.slice(0, 4).join(" → ")
        : db?.route_long_name ?? itin.summary;

    const etaMin =
      db?.eta_minutes != null
        ? Number(db.eta_minutes)
        : Math.ceil(itin.durationSeconds / 60);

    plans.push({
      id: `${itin.routingPreference ?? "default"}:${plans.length}:${db?.route_id ?? "nogtfs"}`,
      routeName: lineTitle.slice(0, 120),
      transfersText:
        db?.transfer_count != null ? `${db.transfer_count}` : "—",
      estimatedText:
        Number.isFinite(etaMin) ? `${Math.round(etaMin)} min` : "—",
      fareText: "—",
      scoreText:
        db?.generalized_cost_minutes != null
          ? `${db.generalized_cost_minutes.toFixed(2)}`
          : undefined,
      boardStop: board,
      offStop: off,
      etaMinutes: Number.isFinite(etaMin) ? etaMin : null,
      fareValue: null,
      generalizedCost: db?.generalized_cost_minutes ?? null,
      transferCount: db?.transfer_count ?? null,
      polyline: itin.coordinates,
      fromGoogle: true,
      googleSummary: itin.summary,
      dbRouteId: db?.route_id,
    });
  }

  return plans.slice(0, limit);
}
