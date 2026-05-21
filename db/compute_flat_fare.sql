-- Optional: match app logic in Supabase for reports or other RPC callers.
-- App uses client-side computeFlatFareForTrip() in lib/transitRoutes.ts — this is not required for the Expo build.
--
-- vehicle legs = 1 + number of transfers (direct = 1 leg).
-- Regular: 13 PHP/leg. Student / pwd / senior: 11 PHP/leg.

create or replace function public.compute_route_fare(
  p_route_id text,
  p_distance_km numeric default 0,
  p_discount_code text default 'regular',
  p_vehicle_legs integer default 1
)
returns table (
  route_id text,
  original_fare numeric,
  discount_amount numeric,
  final_fare numeric,
  currency text
)
language sql
stable
as $$
  with legs as (
    select greatest(1, coalesce(p_vehicle_legs, 1))::int as n
  ),
  calc as (
    select
      p_route_id as rid,
      (13 * n)::numeric as reg_total,
      (11 * n)::numeric as disc_total,
      n
    from legs
  )
  select
    c.rid,
    c.reg_total,
    case
      when lower(trim(p_discount_code)) in ('student', 'pwd', 'senior')
        then c.reg_total - c.disc_total
      else 0::numeric
    end as discount_amount,
    case
      when lower(trim(p_discount_code)) in ('student', 'pwd', 'senior')
        then c.disc_total
      else c.reg_total
    end as final_fare,
    'PHP'::text as currency
  from calc c;
$$;
