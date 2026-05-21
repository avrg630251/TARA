# Routing strategy: OTP (self-host) vs Google + enriched GTFS

This document sketches two ways to evolve TARA beyond the current **Google Directions (transit)** plus **Supabase GTFS matching** stack.

## Where the app is today

- **Google**: multiple transit requests with `transit_routing_preference`, deduped shapes, map polylines.
- **Supabase**: `find_route_options_between_points` + shape overlap, line-name overlap to attach local fare/ETA/metadata.
- **Limits**: Google does not expose “three truly independent transit alternatives” the way driving does; purely **GTFS-derived** second/third paths need **geometries** or a **dedicated transit router**.

---

## Option A — OpenTripPlanner (OTP) self-host

**What it is:** Run the open-source [OpenTripPlanner](https://www.opentripplanner.org/) (Java) yourself. It loads **GTFS** and usually **OSM** street data, builds a multimodal graph, and returns itineraries (often several) with legs, stops, and geometry.

### Typical architecture

```
[Expo app] → HTTPS → [Your backend or Supabase Edge Function] → HTTP → [OTP server :8080]
                                                                              ↑
                                                         GTFS zip(s) + OSM pbf
```

**Do not** expose OTP directly to the public app if you can avoid it: put a **thin API** in front (rate limits, auth, logging).

### Rough self-host steps

1. **Feeds**
   - Latest **GTFS** for your study area (official agency feeds or your import).
   - **OSM extract** (e.g. Geofabrik Philippines or a bbox around NCR) as `.pbf`.
2. **Build a graph** (OTP 2.x uses a build + server model; exact CLI depends on version — follow the version’s “Getting started”).
3. **Run** (often Docker), e.g. mount `graphs/` and feeds, set `JAVA_OPTS` for heap (`-Xmx4G` or more for large regions).
4. **Query** OTP’s **Planner API** (REST/GraphQL depending on version) with from/to coordinates and `arriveBy` / `dateTime` as needed.
5. **Map**: use OTP leg geometries or `legGeometry` in responses to draw polylines **without** Google for those legs.

### Fits your goals when…

- You need **multiple distinguishable transit options** grounded in **your** GTFS.
- You want thesis material on **open data + open router** and full control of routing criteria.

### Costs / risks

- **Ops**: JVM memory, feed updates, occasional graph rebuilds after GTFS changes.
- **Skill**: Linux/Docker, OTP release notes (API has evolved across major versions).
- **Realtime**: Real-time updates need GTFS-RT; extra complexity.

---

## Option B — Stay on Google + richer Supabase GTFS (no OTP)

**What it is:** Keep Google for **first-pass** itineraries and map paths; improve **local** truth with database work.

### Enhancements (incremental)

| Enhancement | Purpose |
|-------------|---------|
| **Per-route shape outlines** (you already have `gtfs_route_shapes`) | Second/third “local” options can each get a **distinct** polyline from your DB when Google only returns one geometry. |
| **RPC: top N diverse `route_id` options** | SQL or app logic that picks N candidates by **different corridor** (shape dissimilarity or disjoint `route_id` sets), not only ETA. |
| **Line-name dictionary** | Table mapping `agency_id + route_short_name` ↔ display names to improve **Google ↔ GTFS** matching. |
| **Optional: stop coordinates in RPC output** | Lets the app draw straight **walk → board → vehicle → alight → walk** without OTP. |

### Fits your goals when…

- Timeline is short and you want to **ship** with existing APIs.
- Thesis emphasis is **mobile + Supabase + UX**, not operating a router.

### Limits

- You still depend on **Google** for primary path discovery if you don’t build another engine.
- Without OTP/Valhalla/etc., “three fully independent” transit optima are **heuristic**, not globally guaranteed.

---

## Practical recommendation (thesis)

1. **Near term (defensible in a paper):** **Option B** — document **Google + GTFS enrichment**, measure **matched vs unmatched** legs, and cite **OTP as future work**.
2. **If you have 2–4 weeks for infra:** Pilot **Option A** on a **small bbox** (one city/agency GTFS + small OSM) to show **side-by-side** Google vs OTP itineraries in an appendix or demo chapter.

---

## If you add OTP later: app integration sketch

1. **Env**: `EXPO_PUBLIC_OTP_PLANNER_URL` (through your gateway, not raw OTP if possible).
2. **Client**: Replace or supplement `fetchTransitItinerariesFromGoogle` with `fetchOtItineraries(from, to)` returning the same internal shape (`coordinates`, board/off names, duration).
3. **Merge**: Keep `composeTransitPlanOptions`-style merging so **OTP legs** attach **fare quotes** via `route_id` from your DB.

---

## References

- OpenTripPlanner: https://www.opentripplanner.org/  
- GTFS: https://gtfs.org/  
- Google Directions transit parameters: documented under “Transit modes and routing preference” in Google Directions API docs.
