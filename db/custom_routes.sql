-- TARA custom GeoJSON itinerary tables.
-- Run this in the Supabase SQL Editor before running the local importer.

create extension if not exists postgis;

create table if not exists public.custom_route_points (
  point_id text primary key,
  point_type text not null
    check (point_type in ('terminal', 'stop', 'destination')),
  terminal_role text,
  name text not null,
  instruction text,
  itinerary_id text,
  itinerary_name text,
  destination_id text not null,
  point_sequence integer,
  latitude double precision not null,
  longitude double precision not null,
  point_geog geography(point, 4326) generated always as (
    st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
  ) stored,
  source text,
  confidence text,
  created_at timestamptz not null default now()
);

create table if not exists public.custom_route_segments (
  segment_id text primary key,
  itinerary_id text not null,
  itinerary_name text not null,
  destination_id text not null,
  segment_sequence integer not null check (segment_sequence > 0),
  segment_type text not null
    check (segment_type in ('walk', 'jeepney', 'tricycle', 'bus')),
  route_id text,
  direction_id integer,
  from_point_id text not null references public.custom_route_points(point_id),
  to_point_id text not null references public.custom_route_points(point_id),
  segment_name text,
  segment_details text,
  what_to_say text,
  coordinates jsonb not null,
  route_geog geography(linestring, 4326) not null,
  source text,
  confidence text,
  fare numeric,
  created_at timestamptz not null default now(),
  unique (itinerary_id, segment_sequence)
);

create table if not exists public.custom_route_itineraries (
  itinerary_id text primary key,
  itinerary_name text not null,
  origin_point_id text not null references public.custom_route_points(point_id),
  destination_id text not null,
  created_at timestamptz not null default now()
);

-- Apply these additions when the tables already existed before the latest schema.
alter table public.custom_route_segments
  add column if not exists segment_name text,
  add column if not exists segment_details text,
  add column if not exists what_to_say text,
  add column if not exists coordinates jsonb,
  add column if not exists route_geog geography(linestring, 4326),
  add column if not exists source text,
  add column if not exists confidence text,
  add column if not exists fare numeric;

create index if not exists custom_route_points_geog_idx
  on public.custom_route_points using gist (point_geog);

create index if not exists custom_route_segments_geog_idx
  on public.custom_route_segments using gist (route_geog);

create index if not exists custom_route_segments_itinerary_idx
  on public.custom_route_segments (itinerary_id, segment_sequence);

alter table public.custom_route_points enable row level security;
alter table public.custom_route_segments enable row level security;
alter table public.custom_route_itineraries enable row level security;

drop policy if exists "Public can read custom route points"
  on public.custom_route_points;
create policy "Public can read custom route points"
  on public.custom_route_points for select to anon, authenticated using (true);

drop policy if exists "Public can read custom route segments"
  on public.custom_route_segments;
create policy "Public can read custom route segments"
  on public.custom_route_segments for select to anon, authenticated using (true);

drop policy if exists "Public can read custom route itineraries"
  on public.custom_route_itineraries;
create policy "Public can read custom route itineraries"
  on public.custom_route_itineraries for select to anon, authenticated using (true);
