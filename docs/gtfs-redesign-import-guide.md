# GTFS Redesign Import Guide (Supabase)

This guide replaces the older destination-text-only approach with a full GTFS schema so your app can detect routes even when the user and destination are both in the middle of a route.

## Files You Already Have

- `routes.txt`
- `trips.txt`
- `stop_times.txt`
- `stops.txt`
- `shapes.txt`

## 1) Run Schema SQL

1. Open Supabase project -> SQL Editor.
2. Run `db/gtfs_redesign.sql`.

This creates:

- GTFS core tables: `gtfs_routes`, `gtfs_trips`, `gtfs_stop_times`, `gtfs_stops`, `gtfs_shapes`
- Geometry table: `gtfs_route_shapes`
- Helper functions:
  - `refresh_gtfs_route_shapes()`
  - `find_routes_between_points(...)`
  - `find_routes_near_points_by_shape(...)`

## 2) Import GTFS Files into Matching Tables

Use **Table Editor -> Import data from CSV** for each table.

Import order matters because of foreign keys:

1. `gtfs_routes` <- `routes.txt`
2. `gtfs_stops` <- `stops.txt`
3. `gtfs_trips` <- `trips.txt`
4. `gtfs_shapes` <- `shapes.txt`
5. `gtfs_stop_times` <- `stop_times.txt`

### Mapping reminders

- Keep headers mapped by name (they already match GTFS).
- `route_type`, `direction_id`, `stop_sequence` should map as integers.
- `stop_lat`, `stop_lon`, `shape_pt_lat`, `shape_pt_lon` as decimals.
- `arrival_time` / `departure_time` stay as text (GTFS can exceed 24h).

## 3) Build Route Geometry

After imports finish, run:

```sql
select public.refresh_gtfs_route_shapes();
```

## 4) Verify Counts

Run:

```sql
select
  (select count(*) from public.gtfs_routes) as routes_count,
  (select count(*) from public.gtfs_trips) as trips_count,
  (select count(*) from public.gtfs_stop_times) as stop_times_count,
  (select count(*) from public.gtfs_stops) as stops_count,
  (select count(*) from public.gtfs_shapes) as shape_points_count,
  (select count(*) from public.gtfs_route_shapes) as route_shapes_count;
```

## 5) Test Mid-Route Detection (Core Fix)

Use real coordinates in your current location + destination area:

```sql
select *
from public.find_routes_between_points(
  14.6091, 121.0223, -- origin lat/lng
  14.6500, 121.0500, -- destination lat/lng
  600                -- stop radius meters
)
limit 20;
```

If this returns rows, your data can now handle "origin and destination are both in the middle of a route."

## 6) Optional Shape-Based Cross-Check

```sql
select *
from public.find_routes_near_points_by_shape(
  14.6091, 121.0223,
  14.6500, 121.0500,
  700
)
limit 20;
```

## 7) App Integration Direction

When you wire the app, use this flow:

1. Geocode origin and destination to coordinates.
2. Call `find_routes_between_points(...)` first (stop-sequence aware).
3. If empty, call `find_routes_near_points_by_shape(...)` as fallback.
4. Join with fare/discount computation for card display.

This is cleaner and more reliable than route-name or destination-text matching.
