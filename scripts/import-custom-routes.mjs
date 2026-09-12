import fs from "node:fs/promises";
import process from "node:process";

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const geoJsonPath =
  process.argv[2] ?? "tara_jeepney_route_shapes.geojson";
dotenv.config({ path: ".env.import.local" });
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.import.local."
  );
}

const geoJson = JSON.parse(await fs.readFile(geoJsonPath, "utf8"));
if (geoJson.type !== "FeatureCollection" || !Array.isArray(geoJson.features)) {
  throw new Error("The input file must be a GeoJSON FeatureCollection.");
}

const points = geoJson.features.filter(
  (feature) => feature.geometry?.type === "Point"
);
const segments = geoJson.features.filter(
  (feature) => feature.geometry?.type === "LineString"
);
const unsupported = geoJson.features.filter(
  (feature) => !["Point", "LineString"].includes(feature.geometry?.type)
);

if (unsupported.length > 0) {
  throw new Error(
    `Unsupported geometry found: ${unsupported[0].geometry?.type ?? "missing"}`
  );
}

const pointRows = points.map((feature) => {
  const properties = feature.properties ?? {};
  const [longitude, latitude] = feature.geometry.coordinates;

  return {
    point_id: required(properties, "point_id"),
    point_type: required(properties, "point_type"),
    terminal_role: properties.terminal_role ?? null,
    name: required(properties, "name"),
    instruction: properties.instruction ?? null,
    itinerary_id: properties.itinerary_id ?? null,
    itinerary_name: properties.itinerary_name ?? null,
    destination_id: required(properties, "destination_id"),
    point_sequence: integerOrNull(properties.point_sequence),
    latitude,
    longitude,
    source: properties.source ?? null,
    confidence: properties.confidence ?? null,
  };
});

const segmentRows = segments.map((feature) => {
  const properties = feature.properties ?? {};
  const coordinates = feature.geometry.coordinates;
  const lineString = coordinates
    .map(([longitude, latitude]) => `${longitude} ${latitude}`)
    .join(",");

  return {
    segment_id: required(properties, "segment_id"),
    itinerary_id: required(properties, "itinerary_id"),
    itinerary_name: required(properties, "itinerary_name"),
    destination_id: required(properties, "destination_id"),
    segment_sequence: requiredInteger(properties, "segment_sequence"),
    segment_type: required(properties, "segment_type"),
    route_id: nullIfStringNull(properties.route_id),
    direction_id: integerOrNull(properties.direction_id),
    from_point_id: required(properties, "from_point_id"),
    to_point_id: required(properties, "to_point_id"),
    segment_name: properties.segment_name ?? properties.name ?? null,
    coordinates,
    route_geog: `SRID=4326;LINESTRING(${lineString})`,
    source: properties.source ?? null,
    confidence: properties.confidence ?? null,
    fare: numberOrNull(properties.fare),
  };
});

const pointsById = new Set(pointRows.map((row) => row.point_id));
for (const segment of segmentRows) {
  if (!pointsById.has(segment.from_point_id)) {
    throw new Error(
      `${segment.segment_id} references missing from_point_id ${segment.from_point_id}`
    );
  }
  if (!pointsById.has(segment.to_point_id)) {
    throw new Error(
      `${segment.segment_id} references missing to_point_id ${segment.to_point_id}`
    );
  }
}

const itineraries = new Map();
for (const segment of segmentRows) {
  if (!itineraries.has(segment.itinerary_id)) {
    const origin = segmentRows.find(
      (candidate) =>
        candidate.itinerary_id === segment.itinerary_id &&
        candidate.segment_sequence === 1
    );
    itineraries.set(segment.itinerary_id, {
      itinerary_id: segment.itinerary_id,
      itinerary_name: segment.itinerary_name,
      origin_point_id: origin.from_point_id,
      destination_id: segment.destination_id,
    });
  }
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

await upsert("custom_route_points", pointRows, "point_id");
await upsert("custom_route_segments", segmentRows, "segment_id");
await upsert(
  "custom_route_itineraries",
  [...itineraries.values()],
  "itinerary_id"
);

console.log(
  `Imported ${pointRows.length} points, ${segmentRows.length} segments, and ${itineraries.size} itineraries.`
);

async function upsert(table, rows, conflictColumn) {
  const { error } = await supabase
    .from(table)
    .upsert(rows, { onConflict: conflictColumn });
  if (error) {
    throw new Error(`Could not import ${table}: ${error.message}`);
  }
}

function required(properties, key) {
  const value = properties[key];
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error(`Missing ${key} in GeoJSON feature.`);
  }
  return value;
}

function requiredInteger(properties, key) {
  const value = Number(required(properties, key));
  if (!Number.isInteger(value)) {
    throw new Error(`${key} must be an integer.`);
  }
  return value;
}

function integerOrNull(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function numberOrNull(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullIfStringNull(value) {
  return value === undefined || value === null || value === "null" ? null : value;
}
