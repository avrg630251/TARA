import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { LatLng } from "@/lib/googleMapsRoutes";
import type { DisplayRouteSegment } from "@/lib/transitPlanOptions";
import { loadGoogleMapsApi } from "@/lib/googleMapsWebLoader";

export type RouteAlternativePolyline = {
  coordinates: LatLng[];
  selected: boolean;
};

export type RouteSegmentPolyline = DisplayRouteSegment;

type FullScreenMapProps = {
  latitude: number;
  longitude: number;
  polylineCoordinates?: LatLng[];
  routeAlternatives?: RouteAlternativePolyline[];
  routeSegments?: RouteSegmentPolyline[];
  destinationCoordinate?: LatLng | null;
  fitSignal?: number;
  navigationMode?: boolean;
  trackedCoordinate?: { latitude: number; longitude: number } | null;
  selectedSegmentId?: string | null;
  onSegmentPress?: (segment: DisplayRouteSegment) => void;
  fitEdgePadding?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
};

const PRIMARY_LINE = "#0B3D2E";
const ALT_LINE = "rgba(51,65,85,0.72)";
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
  routeSegments,
  destinationCoordinate,
  fitSignal,
  navigationMode = false,
  trackedCoordinate,
  selectedSegmentId,
  onSegmentPress,
}: FullScreenMapProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const polylinesRef = useRef<any[]>([]);
  const markersRef = useRef<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fitCoords = useMemo(
    () =>
      [
        ...(routeSegments?.flatMap((segment) => segment.coordinates) ?? []),
        ...collectCoordinates(
        polylineCoordinates,
        routeAlternatives,
        destinationCoordinate ?? null
        ),
      ],
    [polylineCoordinates, routeAlternatives, routeSegments, destinationCoordinate]
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
    const hasAlts =
      routeAlternatives && routeAlternatives.some((r) => r.coordinates.length > 1);
    const segmentColor = (
      segment: RouteSegmentPolyline,
      index: number
    ) => {
      if (segment.segmentType === "walk") return "#495057";
      const colors = ["#0B3D2E", "#0B4F8A", "#7A1FA2", "#B54708", "#8A1538"];
      return colors[index % colors.length];
    };
    if (routeSegments?.length) {
      for (const [index, segment] of routeSegments.entries()) {
        if (segment.coordinates.length < 2) continue;
        const polyline = new g.maps.Polyline({
          map,
          path: segment.coordinates.map((c: LatLng) => ({
            lat: c.latitude,
            lng: c.longitude,
          })),
          strokeColor:
            selectedSegmentId === segment.segmentId
              ? "#FFD43B"
              : segmentColor(segment, index),
          strokeOpacity: 1,
          strokeWeight:
            selectedSegmentId === segment.segmentId
              ? 10
              : navigationMode
                ? 7
                : 6,
          icons:
            segment.segmentType === "walk"
              ? [
                  {
                    icon: {
                      path: "M 0,-1 0,1",
                      strokeOpacity: 1,
                      scale: 3,
                    },
                    offset: "0",
                    repeat: "12px",
                  },
                ]
              : undefined,
        });
        polyline.addListener("click", () => onSegmentPress?.(segment));
        polylinesRef.current.push(polyline);
      }
    } else if (hasAlts) {
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
          strokeWeight: alt.selected ? 7 : 4,
        });
        polylinesRef.current.push(polyline);
      }
    } else if (polylineCoordinates && polylineCoordinates.length > 1) {
      const polyline = new g.maps.Polyline({
        map,
        path: polylineCoordinates.map((c) => ({ lat: c.latitude, lng: c.longitude })),
        strokeColor: PRIMARY_LINE,
        strokeOpacity: 1,
        strokeWeight: navigationMode ? 7 : 6,
      });
      polylinesRef.current.push(polyline);
    }

    if (destinationCoordinate) {
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

    const activeTracked = trackedCoordinate ?? {
      latitude,
      longitude,
    };
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
    routeSegments,
    destinationCoordinate,
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