import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { LatLng } from "@/lib/googleMapsRoutes";
import { loadGoogleMapsApi } from "@/lib/googleMapsWebLoader";

export type RouteAlternativePolyline = {
  coordinates: LatLng[];
  selected: boolean;
};

type FullScreenMapProps = {
  latitude: number;
  longitude: number;
  polylineCoordinates?: LatLng[];
  routeAlternatives?: RouteAlternativePolyline[];
  destinationCoordinate?: LatLng | null;
  destinationRadiusMeters?: number;
  fitSignal?: number;
  navigationMode?: boolean;
  trackedCoordinate?: { latitude: number; longitude: number } | null;
  fitEdgePadding?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
};

const PRIMARY_LINE = "#1B4332";
const ALT_LINE = "rgba(100,116,139,0.45)";
const NAV_ZOOM = 16;

function toBounds(g: any, coords: LatLng[]) {
  const bounds = new g.maps.LatLngBounds();
  for (const c of coords) bounds.extend({ lat: c.latitude, lng: c.longitude });
  return bounds;
}

function collectCoordinates(
  legacy: LatLng[] | undefined,
  alts: RouteAlternativePolyline[] | undefined,
  destination: LatLng | null | undefined
): LatLng[] {
  const out: LatLng[] = [];
  if (alts?.length) {
    for (const alt of alts) out.push(...alt.coordinates);
  } else if (legacy?.length) {
    out.push(...legacy);
  }
  if (destination) out.push(destination);
  return out;
}

export function FullScreenMap({
  latitude,
  longitude,
  polylineCoordinates,
  routeAlternatives,
  destinationCoordinate,
  destinationRadiusMeters,
  fitSignal,
  navigationMode = false,
  trackedCoordinate,
}: FullScreenMapProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const polylinesRef = useRef<any[]>([]);
  const markersRef = useRef<any[]>([]);
  const circleRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fitCoords = useMemo(
    () =>
      collectCoordinates(
        polylineCoordinates,
        routeAlternatives,
        destinationCoordinate ?? null
      ),
    [polylineCoordinates, routeAlternatives, destinationCoordinate]
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await loadGoogleMapsApi();
        if (!mounted || !hostRef.current) return;
        const g = (window as any).google;
        if (!g?.maps) return;
        if (!mapRef.current) {
          mapRef.current = new g.maps.Map(hostRef.current, {
            center: { lat: latitude, lng: longitude },
            zoom: 14,
            mapTypeControl: false,
            fullscreenControl: false,
            streetViewControl: false,
            clickableIcons: false,
          });
        }
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Map failed to load.");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [latitude, longitude]);

  useEffect(() => {
    if (!mapRef.current || !(window as any).google?.maps) return;
    const g = (window as any).google;
    const map = mapRef.current;

    for (const pl of polylinesRef.current) pl.setMap(null);
    polylinesRef.current = [];
    for (const m of markersRef.current) m.setMap(null);
    markersRef.current = [];
    if (circleRef.current) {
      circleRef.current.setMap(null);
      circleRef.current = null;
    }

    const hasAlts =
      routeAlternatives && routeAlternatives.some((r) => r.coordinates.length > 1);
    if (hasAlts) {
      for (const alt of routeAlternatives ?? []) {
        if (alt.coordinates.length < 2) continue;
        const polyline = new g.maps.Polyline({
          map,
          path: alt.coordinates.map((c: LatLng) => ({
            lat: c.latitude,
            lng: c.longitude,
          })),
          strokeColor: alt.selected ? PRIMARY_LINE : ALT_LINE,
          strokeOpacity: 1,
          strokeWeight: alt.selected ? 6 : 3,
        });
        polylinesRef.current.push(polyline);
      }
    } else if (polylineCoordinates && polylineCoordinates.length > 1) {
      const polyline = new g.maps.Polyline({
        map,
        path: polylineCoordinates.map((c) => ({ lat: c.latitude, lng: c.longitude })),
        strokeColor: PRIMARY_LINE,
        strokeOpacity: 1,
        strokeWeight: navigationMode ? 5 : 4,
      });
      polylinesRef.current.push(polyline);
    }

    if (destinationCoordinate) {
      if (destinationRadiusMeters && destinationRadiusMeters > 0 && !navigationMode) {
        circleRef.current = new g.maps.Circle({
          map,
          center: {
            lat: destinationCoordinate.latitude,
            lng: destinationCoordinate.longitude,
          },
          radius: destinationRadiusMeters,
          fillColor: "rgba(27,67,50,0.14)",
          fillOpacity: 1,
          strokeColor: "rgba(27,67,50,0.6)",
          strokeOpacity: 1,
          strokeWeight: 2,
        });
      }
      const destinationMarker = new g.maps.Marker({
        map,
        position: {
          lat: destinationCoordinate.latitude,
          lng: destinationCoordinate.longitude,
        },
        title: "Destination",
      });
      markersRef.current.push(destinationMarker);
    }

    const activeTracked = navigationMode ? trackedCoordinate : null;
    if (
      activeTracked &&
      Number.isFinite(activeTracked.latitude) &&
      Number.isFinite(activeTracked.longitude)
    ) {
      const trackedMarker = new g.maps.Marker({
        map,
        position: { lat: activeTracked.latitude, lng: activeTracked.longitude },
        title: "Your location",
      });
      markersRef.current.push(trackedMarker);
      map.panTo({ lat: activeTracked.latitude, lng: activeTracked.longitude });
      map.setZoom(NAV_ZOOM);
      return;
    }

    if (fitCoords.length >= 2 && !navigationMode) {
      map.fitBounds(toBounds(g, fitCoords), 46);
    } else {
      map.setCenter({ lat: latitude, lng: longitude });
    }
  }, [
    latitude,
    longitude,
    polylineCoordinates,
    routeAlternatives,
    destinationCoordinate,
    destinationRadiusMeters,
    fitCoords,
    navigationMode,
    trackedCoordinate?.latitude,
    trackedCoordinate?.longitude,
    fitSignal,
  ]);

  return (
    <View style={styles.root}>
      <div ref={hostRef} style={styles.webMap as any} />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#e9ecef",
  },
  webMap: {
    width: "100%",
    height: "100%",
  },
  errorText: {
    position: "absolute",
    left: 14,
    right: 14,
    top: 14,
    fontSize: 12,
    color: "#b02a37",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
});