-- GTFS database redesign for Supabase
-- Files supported:
-- - routes.txt
-- - trips.txt
-- - stop_times.txt
-- - stops.txt
-- - shapes.txt
--
-- Run this first in Supabase SQL Editor, then import CSV/TXT rows
-- into the created tables from the dashboard.

create extension if not exists postgis;
create extension if not exists pg_trgm;

-- Core GTFS tables
create table if not exists public.gtfs_routes (
  route_id text primary key,
  agency_id text,
  route_short_name text,
  route_long_name text,
  route_desc text,
  route_type integer,
  route_url text,
  route_color text,
  route_text_color text,
  created_at timestamptz not null default now()
);

create table if not exists public.gtfs_stops (
  stop_id text primary key,
  stop_code text,
  stop_name text not null,
  stop_desc text,
  stop_lat double precision not null,
  stop_lon double precision not null,
  zone_id text,
  stop_url text,
  location_type integer,
  parent_station text,
  wheelchair_boarding integer,
  stop_geog geography(point, 4326) generated always as (
    st_setsrid(st_makepoint(stop_lon, stop_lat), 4326)::geography
  ) stored,
  created_at timestamptz not null default now()
);

create table if not exists public.gtfs_trips (
  trip_id text primary key,
  route_id text not null references public.gtfs_routes(route_id) on delete cascade,
  service_id text,
  trip_short_name text,
  trip_headsign text,
  direction_id integer,
  block_id text,
  shape_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.gtfs_stop_times (
  trip_id text not null references public.gtfs_trips(trip_id) on delete cascade,
  stop_sequence integer not null,
  stop_id text not null references public.gtfs_stops(stop_id) on delete cascade,
  arrival_time text,
  departure_time text,
  stop_headsign text,
  pickup_type integer,
  drop_off_type integer,
  shape_dist_traveled double precision,
  created_at timestamptz not null default now(),
  primary key (trip_id, stop_sequence)
);

create table if not exists public.gtfs_shapes (
  shape_id text not null,
  shape_pt_sequence integer not null,
  shape_dist_traveled double precision,
  shape_pt_lat double precision not null,
  shape_pt_lon double precision not null,
  created_at timestamptz not null default now(),
  primary key (shape_id, shape_pt_sequence)
);

-- Helpful indexes
create index if not exists gtfs_stops_geog_gix on public.gtfs_stops using gist (stop_geog);
create index if not exists gtfs_trips_route_idx on public.gtfs_trips(route_id);
create index if not exists gtfs_trips_shape_idx on public.gtfs_trips(shape_id);
create index if not exists gtfs_stop_times_stop_idx on public.gtfs_stop_times(stop_id);
create index if not exists gtfs_stop_times_trip_idx on public.gtfs_stop_times(trip_id);
create index if not exists gtfs_stop_times_trip_seq_idx on public.gtfs_stop_times(trip_id, stop_sequence);
create index if not exists gtfs_routes_search_idx
  on public.gtfs_routes using gin (
    (coalesce(route_long_name, '') || ' ' || coalesce(route_desc, '')) gin_trgm_ops
  );

-- Build route geometry from shapes -> trips -> routes.
create table if not exists public.gtfs_route_shapes (
  route_id text not null references public.gtfs_routes(route_id) on delete cascade,
  shape_id text not null,
  route_geog geography(linestring, 4326) not null,
  point_count integer not null,
  created_at timestamptz not null default now(),
  primary key (route_id, shape_id)
);

create index if not exists gtfs_route_shapes_geog_gix
  on public.gtfs_route_shapes using gist (route_geog);
create index if not exists gtfs_route_shapes_route_idx
  on public.gtfs_route_shapes(route_id);

create or replace function public.refresh_gtfs_route_shapes()
returns void
language sql
as $$
  truncate table public.gtfs_route_shapes;

  insert into public.gtfs_route_shapes (route_id, shape_id, route_geog, point_count)
  select
    t.route_id,
    s.shape_id,
    st_makeline(
      st_setsrid(st_makepoint(s.shape_pt_lon, s.shape_pt_lat), 4326)
      order by s.shape_pt_sequence
    )::geography as route_geog,
    count(*)::int as point_count
  from public.gtfs_shapes s
  join public.gtfs_trips t
    on t.shape_id = s.shape_id
  where t.shape_id is not null
  group by t.route_id, s.shape_id;
$$;

-- Mid-route matching helper:
-- Returns routes where one stop near origin comes before a stop near destination
-- in the same trip (direction-aware because stop_sequence is enforced).
create or replace function public.find_routes_between_points(
  p_origin_lat double precision,
  p_origin_lng double precision,
  p_dest_lat double precision,
  p_dest_lng double precision,
  p_stop_radius_m integer default 600
)
returns table (
  route_id text,
  route_long_name text,
  possible_trip_count bigint,
  nearest_origin_stop text,
  nearest_destination_stop text
)
language sql
stable
as $$
  with
  origin_point as (
    select st_setsrid(st_makepoint(p_origin_lng, p_origin_lat), 4326)::geography as g
  ),
  destination_point as (
    select st_setsrid(st_makepoint(p_dest_lng, p_dest_lat), 4326)::geography as g
  ),
  origin_near as (
    select s.stop_id, s.stop_name
    from public.gtfs_stops s, origin_point op
    where st_dwithin(s.stop_geog, op.g, p_stop_radius_m)
  ),
  destination_near as (
    select s.stop_id, s.stop_name
    from public.gtfs_stops s, destination_point dp
    where st_dwithin(s.stop_geog, dp.g, p_stop_radius_m)
  ),
  trip_origin_seq as (
    select st.trip_id, min(st.stop_sequence) as origin_seq
    from public.gtfs_stop_times st
    join origin_near o on o.stop_id = st.stop_id
    group by st.trip_id
  ),
  trip_destination_seq as (
    select st.trip_id, max(st.stop_sequence) as destination_seq
    from public.gtfs_stop_times st
    join destination_near d on d.stop_id = st.stop_id
    group by st.trip_id
  ),
  viable_trips as (
    select
      t.trip_id,
      t.route_id
    from public.gtfs_trips t
    join trip_origin_seq os on os.trip_id = t.trip_id
    join trip_destination_seq ds on ds.trip_id = t.trip_id
    where os.origin_seq < ds.destination_seq
  )
  select
    r.route_id,
    r.route_long_name,
    count(distinct vt.trip_id) as possible_trip_count,
    (select o.stop_name from origin_near o limit 1) as nearest_origin_stop,
    (select d.stop_name from destination_near d limit 1) as nearest_destination_stop
  from viable_trips vt
  join public.gtfs_routes r on r.route_id = vt.route_id
  group by r.route_id, r.route_long_name
  order by possible_trip_count desc, r.route_long_name asc;
$$;

-- Optional route-level proximity helper (shape-based).
create or replace function public.find_routes_near_points_by_shape(
  p_origin_lat double precision,
  p_origin_lng double precision,
  p_dest_lat double precision,
  p_dest_lng double precision,
  p_shape_radius_m integer default 700
)
returns table (
  route_id text,
  route_long_name text,
  shape_match_count bigint
)
language sql
stable
as $$
  with
  origin_point as (
    select st_setsrid(st_makepoint(p_origin_lng, p_origin_lat), 4326)::geography as g
  ),
  destination_point as (
    select st_setsrid(st_makepoint(p_dest_lng, p_dest_lat), 4326)::geography as g
  )
  select
    r.route_id,
    r.route_long_name,
    count(*)::bigint as shape_match_count
  from public.gtfs_route_shapes rs
  join public.gtfs_routes r on r.route_id = rs.route_id
  join origin_point op on st_dwithin(rs.route_geog, op.g, p_shape_radius_m)
  join destination_point dp on st_dwithin(rs.route_geog, dp.g, p_shape_radius_m)
  group by r.route_id, r.route_long_name
  order by shape_match_count desc, r.route_long_name asc;
$$;

-- Parse GTFS time text (can exceed 24:00:00) into seconds.
create or replace function public.gtfs_time_to_seconds(p_time text)
returns integer
language sql
immutable
as $$
  select case
    when p_time is null or p_time = '' then null
    when p_time ~ '^\d{1,2}:\d{2}:\d{2}$'
      then split_part(p_time, ':', 1)::int * 3600
         + split_part(p_time, ':', 2)::int * 60
         + split_part(p_time, ':', 3)::int
    else null
  end;
$$;

-- Route options with direct-trip transfer count and ETA derived from stop_times.
create or replace function public.find_route_options_between_points(
  p_origin_lat double precision,
  p_origin_lng double precision,
  p_dest_lat double precision,
  p_dest_lng double precision,
  p_stop_radius_m integer default 600,
  p_transfer_penalty_min integer default 10,
  p_walk_meters_per_minute numeric default 75,
  p_walk_weight numeric default 1.2
)
returns table (
  route_id text,
  route_long_name text,
  possible_trip_count bigint,
  nearest_origin_stop text,
  nearest_destination_stop text,
  transfer_count integer,
  eta_minutes integer,
  generalized_cost_minutes numeric
)
language sql
stable
as $$
  with
  origin_point as (
    select st_setsrid(st_makepoint(p_origin_lng, p_origin_lat), 4326)::geography as g
  ),
  destination_point as (
    select st_setsrid(st_makepoint(p_dest_lng, p_dest_lat), 4326)::geography as g
  ),
  origin_near as (
    select
      s.stop_id,
      s.stop_name,
      st_distance(s.stop_geog, op.g) as walk_meters
    from public.gtfs_stops s, origin_point op
    where st_dwithin(s.stop_geog, op.g, p_stop_radius_m)
  ),
  destination_near as (
    select
      s.stop_id,
      s.stop_name,
      st_distance(s.stop_geog, dp.g) as walk_meters
    from public.gtfs_stops s, destination_point dp
    where st_dwithin(s.stop_geog, dp.g, p_stop_radius_m)
  ),
  origin_best as (
    select stop_name, walk_meters
    from origin_near
    order by walk_meters asc
    limit 1
  ),
  destination_best as (
    select stop_name, walk_meters
    from destination_near
    order by walk_meters asc
    limit 1
  ),
  direct_trip_pairs as (
    select
      t.route_id,
      st1.trip_id,
      st1.departure_time as origin_departure_time,
      st2.arrival_time as destination_arrival_time
    from public.gtfs_stop_times st1
    join public.gtfs_stop_times st2 on st1.trip_id = st2.trip_id
    join public.gtfs_trips t on t.trip_id = st1.trip_id
    where st1.stop_id in (select stop_id from origin_near)
      and st2.stop_id in (select stop_id from destination_near)
      and st1.stop_sequence < st2.stop_sequence
  ),
  direct_options as (
    select
      tp.route_id as option_key,
      r.route_long_name as option_name,
      count(distinct tp.trip_id)::bigint as possible_trip_count,
      min(
        case
          when public.gtfs_time_to_seconds(tp.destination_arrival_time) is null
            or public.gtfs_time_to_seconds(tp.origin_departure_time) is null
            then null
          when public.gtfs_time_to_seconds(tp.destination_arrival_time)
               - public.gtfs_time_to_seconds(tp.origin_departure_time) < 0
            then null
          else (
            public.gtfs_time_to_seconds(tp.destination_arrival_time)
            - public.gtfs_time_to_seconds(tp.origin_departure_time)
          )
        end
      ) as min_eta_seconds
    from direct_trip_pairs tp
    join public.gtfs_routes r on r.route_id = tp.route_id
    group by tp.route_id, r.route_long_name
  ),
  one_transfer_trip_pairs as (
    select
      t1.route_id as route_1,
      t2.route_id as route_2,
      st_o.trip_id as trip_1,
      st_d.trip_id as trip_2,
      st_x1.stop_id as transfer_stop_id,
      st_o.departure_time as origin_departure_time,
      st_x1.arrival_time as transfer_arrival_time,
      st_x2.departure_time as transfer_departure_time,
      st_d.arrival_time as destination_arrival_time
    from public.gtfs_stop_times st_o
    join public.gtfs_stop_times st_x1
      on st_x1.trip_id = st_o.trip_id
     and st_x1.stop_sequence > st_o.stop_sequence
    join public.gtfs_trips t1 on t1.trip_id = st_o.trip_id

    join public.gtfs_stop_times st_x2
      on st_x2.stop_id = st_x1.stop_id
    join public.gtfs_stop_times st_d
      on st_d.trip_id = st_x2.trip_id
     and st_d.stop_sequence > st_x2.stop_sequence
    join public.gtfs_trips t2 on t2.trip_id = st_d.trip_id
    where st_o.stop_id in (select stop_id from origin_near)
      and st_d.stop_id in (select stop_id from destination_near)
      and t1.route_id <> t2.route_id
      and st_o.trip_id <> st_d.trip_id
      and public.gtfs_time_to_seconds(st_o.departure_time) is not null
      and public.gtfs_time_to_seconds(st_x1.arrival_time) is not null
      and public.gtfs_time_to_seconds(st_x2.departure_time) is not null
      and public.gtfs_time_to_seconds(st_d.arrival_time) is not null
      and public.gtfs_time_to_seconds(st_x1.arrival_time)
          >= public.gtfs_time_to_seconds(st_o.departure_time)
      and public.gtfs_time_to_seconds(st_x2.departure_time)
          >= public.gtfs_time_to_seconds(st_x1.arrival_time)
      and public.gtfs_time_to_seconds(st_d.arrival_time)
          >= public.gtfs_time_to_seconds(st_x2.departure_time)
  ),
  one_transfer_options as (
    select
      (otp.route_1 || ' -> ' || otp.route_2) as option_key,
      (coalesce(r1.route_long_name, otp.route_1) || ' -> ' ||
       coalesce(r2.route_long_name, otp.route_2)) as option_name,
      count(distinct (otp.trip_1 || ':' || otp.trip_2))::bigint as possible_trip_count,
      min(
        public.gtfs_time_to_seconds(otp.destination_arrival_time)
        - public.gtfs_time_to_seconds(otp.origin_departure_time)
      ) as min_eta_seconds
    from one_transfer_trip_pairs otp
    join public.gtfs_routes r1 on r1.route_id = otp.route_1
    join public.gtfs_routes r2 on r2.route_id = otp.route_2
    group by 1, 2
  )
  select
    o.option_key as route_id,
    o.option_name as route_long_name,
    o.possible_trip_count,
    (select ob.stop_name from origin_best ob) as nearest_origin_stop,
    (select db.stop_name from destination_best db) as nearest_destination_stop,
    o.transfer_count,
    case
      when o.min_eta_seconds is null then null
      else ceil(o.min_eta_seconds / 60.0)::int
    end as eta_minutes,
    round(
      (
        coalesce(ceil(o.min_eta_seconds / 60.0)::numeric, 9999)
        + (o.transfer_count * p_transfer_penalty_min)::numeric
        + (
          (
            coalesce((select ob.walk_meters from origin_best ob), p_stop_radius_m)
            + coalesce((select db.walk_meters from destination_best db), p_stop_radius_m)
          )::numeric / nullif(p_walk_meters_per_minute, 0)
        ) * p_walk_weight
      )::numeric,
      2
    ) as generalized_cost_minutes
  from (
    select
      d.option_key,
      d.option_name,
      d.possible_trip_count,
      d.min_eta_seconds,
      0::int as transfer_count
    from direct_options d
    union all
    select
      t.option_key,
      t.option_name,
      t.possible_trip_count,
      t.min_eta_seconds,
      1::int as transfer_count
    from one_transfer_options t
  ) o
  order by generalized_cost_minutes asc, eta_minutes nulls last, o.possible_trip_count desc, o.option_name asc;
$$;

-- RLS defaults for client-side reads.
alter table public.gtfs_routes enable row level security;
alter table public.gtfs_stops enable row level security;
alter table public.gtfs_trips enable row level security;
alter table public.gtfs_stop_times enable row level security;
alter table public.gtfs_shapes enable row level security;
alter table public.gtfs_route_shapes enable row level security;

drop policy if exists "gtfs_routes_read_auth" on public.gtfs_routes;
create policy "gtfs_routes_read_auth" on public.gtfs_routes
for select to authenticated using (true);

drop policy if exists "gtfs_stops_read_auth" on public.gtfs_stops;
create policy "gtfs_stops_read_auth" on public.gtfs_stops
for select to authenticated using (true);

drop policy if exists "gtfs_trips_read_auth" on public.gtfs_trips;
create policy "gtfs_trips_read_auth" on public.gtfs_trips
for select to authenticated using (true);

drop policy if exists "gtfs_stop_times_read_auth" on public.gtfs_stop_times;
create policy "gtfs_stop_times_read_auth" on public.gtfs_stop_times
for select to authenticated using (true);

drop policy if exists "gtfs_shapes_read_auth" on public.gtfs_shapes;
create policy "gtfs_shapes_read_auth" on public.gtfs_shapes
for select to authenticated using (true);

drop policy if exists "gtfs_route_shapes_read_auth" on public.gtfs_route_shapes;
create policy "gtfs_route_shapes_read_auth" on public.gtfs_route_shapes
for select to authenticated using (true);
