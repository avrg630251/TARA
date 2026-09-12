create or replace function public.find_routes_near_points_with_geometry(
  p_origin_lat double precision,
  p_origin_lng double precision,
  p_dest_lat double precision,
  p_dest_lng double precision,
  p_shape_radius_m integer default 700
)
returns table (
  route_id text,
  route_long_name text,
  shape_id text,
  shape_match_count bigint,
  geometry jsonb
)
language sql
stable
as $$
  with
  origin_point as (
    select st_setsrid(
      st_makepoint(p_origin_lng, p_origin_lat),
      4326
    )::geography as g
  ),
  destination_point as (
    select st_setsrid(
      st_makepoint(p_dest_lng, p_dest_lat),
      4326
    )::geography as g
  ),
  matched_shapes as (
    select
      rs.route_id,
      rs.shape_id,
      rs.route_geog,
      2::bigint as match_score
    from public.gtfs_route_shapes rs
    cross join origin_point op
    cross join destination_point dp
    where st_dwithin(rs.route_geog, op.g, p_shape_radius_m)
      and st_dwithin(rs.route_geog, dp.g, p_shape_radius_m)
      and rs.point_count >= 2
  ),
  route_geometry as (
    select
      ms.route_id,
      ms.shape_id,
      ms.match_score,
      jsonb_agg(
        jsonb_build_object(
          'latitude', st_y(points.geom),
          'longitude', st_x(points.geom)
        )
        order by points.path
      ) as geometry
    from matched_shapes ms
    cross join lateral st_dumppoints(
      ms.route_geog::geometry
    ) as points(path, geom)
    group by
      ms.route_id,
      ms.shape_id,
      ms.match_score
  )
  select
    rg.route_id,
    r.route_long_name,
    rg.shape_id,
    rg.match_score as shape_match_count,
    rg.geometry
  from route_geometry rg
  join public.gtfs_routes r
    on r.route_id = rg.route_id
  where jsonb_array_length(rg.geometry) >= 2
  order by
    rg.match_score desc,
    r.route_long_name asc;
$$;

grant execute on function public.find_routes_near_points_with_geometry(
  double precision,
  double precision,
  double precision,
  double precision,
  integer
) to authenticated;