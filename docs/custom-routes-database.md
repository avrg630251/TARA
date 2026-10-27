# TARA Custom Routes Database Documentation

This document describes the schema and conventions for the custom route itineraries in Supabase, specifically focusing on the `custom_route_segments` table, the `segment_details` (What to look for) column, the `what_to_say` (What to tell the driver) column, and commuter tips.

---

## 1. Schema Overview

The custom routing system in TARA models localized multi-leg transit journeys to De La Salle Araneta University (DLSAU) using three primary tables in the `public` schema:

1. **`custom_route_points`**: Transit terminals, transfer stops, and key landmarks.
2. **`custom_route_segments`**: Individual route legs (walk, jeepney, tricycle, bus) connecting points with polyline geometries.
3. **`custom_route_itineraries`**: End-to-end trip itineraries linking an origin terminal to DLSAU.

---

## 2. `custom_route_segments` Table Definition

```sql
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
```

---

## 3. Transit Guidance Columns

### A. The `segment_details` Column (What to Look For)
Commuters need physical visual cues to identify the incoming vehicle:
- **Jeepneys & Buses**: The route signboard or windshield placard displaying the vehicle's destination or via points.
- **Tricycles**: The designated TODA color of the tricycle body/canopy.
- **Walking**: Blank (`null`).

### B. The `what_to_say` Column (What to Tell the Driver)
Guides commuters on what drop-off point or landmark to tell the driver/conductor when boarding or paying fare:
- **Jeepneys & Buses**: Specific stop name or drop-off junction (e.g. *"Camachile or Sakayan Monumento"*, *"Victoneta"*, *"SMGC"*, *"Gate 5"*).
- **Tricycles**: Specific campus gate or transfer landmark (e.g. *"La Salle Araneta"*, *"Gate 5"*, *"Apple Ville"*).
- **Walking**: Blank (`null`).

---

## 4. Current Database Records (`custom_route_segments`)

| Segment ID | Type | Segment Name | `segment_details` (Look for) | `what_to_say` (Tell driver) |
| :--- | :--- | :--- | :--- | :--- |
| `ITIN_ROUTE_QUIRINO_DLSAU_1` | `jeepney` | Jeepney from Quirino Hwy. to Camachile | `Balintawak Ibabaw or Blumentritt` | `Camachile or Sakayan Monumento` |
| `ITIN_ROUTE_QUIRINO_DLSAU_2` | `walk` | Walk from Camachile to NDR Tricycle Terminal | `null` | `null` |
| `ITIN_ROUTE_QUIRINO_DLSAU_3` | `tricycle` | Tricycle from NDR to DLSAU | `Blue` | `La Salle Araneta` |
| `ITIN_ROUTE_VGC_DLSAU_1` | `bus` | Bus from VGC to SMGC | `Monumento` | `SMGC` |
| `ITIN_ROUTE_VGC_DLSAU_2` | `jeepney` | Jeepney from SMGC to Victoneta Avenue | `Malinta or Malanday` | `Victoneta` |
| `ITIN_ROUTE_VGC_DLSAU_3` | `walk` | Walk from Victoneta Ave. to Tricycle Terminal | `null` | `null` |
| `ITIN_ROUTE_VGC_DLSAU_4` | `tricycle` | Tricycle from Victoneta Ave. to DLSAU | `Red` | `La Salle Araneta` |
| `ITIN_ROUTE_BAGONGBARRIO_DLSAU_1` | `jeepney` | Jeepney from Jollibee Bagong Barrio to Gate 5 | `Jollibee Bagong Barrio (Ikot)` | `Gate 5` |
| `ITIN_ROUTE_BAGONGBARRIO_DLSAU_2` | `walk` | Walk from Gate 5 to DLSAU | `null` | `null` |
| `ITIN_ROUTE_SMGC_DLSAU_1` | `jeepney` | Jeepney from SMGC to Victoneta Avenue | `Malinta or Malanday` | `Victoneta` |
| `ITIN_ROUTE_SMGC_DLSAU_2` | `walk` | Walk from Victoneta Ave. to Tricycle Terminal | `null` | `null` |
| `ITIN_ROUTE_SMGC_DLSAU_3` | `tricycle` | Tricycle from Victoneta Ave. to DLSAU | `Red` | `Gate 5` |
| `ITIN_ROUTE_MCU_DLSAU_1` | `tricycle` | Tricycle from MCU to Gate 5 | `Red` | `Gate 5` |
| `ITIN_ROUTE_MCU_DLSAU_2` | `walk` | Walk from Gate 5 to DLSAU | `null` | `null` |
| `ITIN_ROUTE_STAQ_DLSAU_1` | `tricycle` | Tricycle from Sta. Quiteria to Apple Ville | `Red` | `Apple Ville` |
| `ITIN_ROUTE_STAQ_DLSAU_2` | `tricycle` | Tricycle from Apple Ville to DLSAU | `Purple` | `La Salle Araneta` |
| `ITIN_ROUTE_PPLPARK_DLSAU_1` | `jeepney` | Jeepney from People's Park to Victoneta Ave. | `Monumento` | `SMGC` |
| `ITIN_ROUTE_PPLPARK_DLSAU_2` | `walk` | Walk from Victoneta Ave. to Tricycle Terminal | `null` | `null` |
| `ITIN_ROUTE_PPLPARK_DLSAU_3` | `tricycle` | Tricycle from Victoneta Ave. to DLSAU | `Red` | `La Salle Araneta` |

---

## 5. Commuter Tips

TARA displays essential commuter advisories to keep users informed and safe:
1. **Route Verification Tip**: *"Just to make sure, don't forget to ask that the transpo they are taking is the correct route."*
2. **Fare Variance Tip**: *"Estimated fare is not 100% exact but should not exceed over 15% of the estimated price."*
