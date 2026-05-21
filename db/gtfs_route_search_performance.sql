-- Run in Supabase SQL Editor after gtfs_redesign.sql (indexes + timeouts).
--
-- Symptom: "canceling statement due to statement timeout" when calling:
--   find_route_options_between_points
--   find_routes_near_points_by_shape

-- ---------------------------------------------------------------------------
-- 1. Indexes — reduce work for hub transfers (many rows per stop_id).
-- ---------------------------------------------------------------------------
create index if not exists gtfs_stop_times_stop_trip_seq_idx
  on public.gtfs_stop_times (stop_id, trip_id, stop_sequence);

-- Helps "board at origin stop, alight later on same trip" filters.
create index if not exists gtfs_stop_times_trip_stop_seq_idx
  on public.gtfs_stop_times (trip_id, stop_id, stop_sequence);

-- ---------------------------------------------------------------------------
-- 2. Per-function statement timeout (PostgreSQL session var for that call).
--    Adjust '120s' if needed (e.g. '60s' on small DB, '180s' on huge feeds).
-- ---------------------------------------------------------------------------
alter function public.find_route_options_between_points(
  double precision,
  double precision,
  double precision,
  double precision,
  integer,
  integer,
  numeric,
  numeric
) set statement_timeout = '120s';

alter function public.find_routes_near_points_by_shape(
  double precision,
  double precision,
  double precision,
  double precision,
  integer
) set statement_timeout = '120s';

-- Optional: mid-route helper if you call it from SQL/clients
alter function public.find_routes_between_points(
  double precision,
  double precision,
  double precision,
  double precision,
  integer
) set statement_timeout = '120s';
