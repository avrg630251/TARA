import { useEffect, useMemo, useRef } from "react";
import { Platform, StyleSheet } from "react-native";
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  type Region,
} from "react-native-maps";

import type { LatLng } from "@/lib/googleMapsRoutes";
import type { DisplayRouteSegment } from "@/lib/transitPlanOptions";

export type RouteAlternativePolyline = {
  id: string;
  coordinates: LatLng[];
  /** Highlighted alternative (typically user-selected chip). */
  selected: boolean;
};

export type RouteSegmentPolyline = DisplayRouteSegment;

type FullScreenMapProps = {
  latitude: number;
  longitude: number;
  /** Single-path mode (backward compatible). */
  polylineCoordinates?: LatLng[];
  /** Multiple paths — Google Maps-style alternates on one map. */
  routeAlternatives?: RouteAlternativePolyline[];
  routeSegments?: RouteSegmentPolyline[];
  routeRenderKey?: string | null;
  destinationCoordinate?: LatLng | null;
  /** Bump to refit bounds (same coordinates, new selection). */
  fitSignal?: number;
  /** Live navigation: follow device position; disables route-wide fit. */
  navigationMode?: boolean;
  /** Latest fix while navigating (centers / animates map). */
  trackedCoordinate?: { latitude: number; longitude: number } | null;
  selectedSegmentId?: string | null;
  onSegmentPress?: (segment: DisplayRouteSegment) => void;
  /** Padding when fitting the route (accounts for overlays). */
  fitEdgePadding?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
};

const DELTA = 0.04;
const NAV_DELTA = 0.006;

const DEFAULT_PADDING = {
  top: 160,
  right: 32,
  bottom: 280,
  left: 32,
};

const PRIMARY_LINE = "#0B3D2E";
const ALT_LINE = "rgba(51,65,85,0.72)";

function collectCoordinates(
  legacy: LatLng[] | undefined,
  alts: RouteAlternativePolyline[] | undefined,
  destination: LatLng | null | undefined
): LatLng[] {
  const out: LatLng[] = [];
  if (alts?.length) {
    for (const a of alts) {
      for (const c of a.coordinates) out.push(c);
    }
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
  routeRenderKey,
  destinationCoordinate,
  fitSignal,
  navigationMode = false,
  trackedCoordinate,
  selectedSegmentId,
  onSegmentPress,
  fitEdgePadding = DEFAULT_PADDING,
}: FullScreenMapProps) {
  const mapRef = useRef<MapView>(null);
  const lastNavAnimAt = useRef(0);

  const region: Region = {
    latitude,
    longitude,
    latitudeDelta: DELTA,
    longitudeDelta: DELTA,
  };

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
    [
      polylineCoordinates,
      routeAlternatives,
      routeSegments,
      destinationCoordinate,
      fitSignal,
    ]
  );

  useEffect(() => {
    if (navigationMode) return;
    if (fitCoords.length < 2 || !mapRef.current) return;

    const t = requestAnimationFrame(() => {
      mapRef.current?.fitToCoordinates(fitCoords, {
        edgePadding: fitEdgePadding,
        animated: true,
      });
    });
    return () => cancelAnimationFrame(t);
  }, [navigationMode, fitCoords, fitEdgePadding, fitSignal]);

  useEffect(() => {
    if (
      !navigationMode ||
      !trackedCoordinate ||
      !mapRef.current ||
      !Number.isFinite(trackedCoordinate.latitude) ||
      !Number.isFinite(trackedCoordinate.longitude)
    ) {
      return;
    }

    const now = Date.now();
    if (now - lastNavAnimAt.current < 400) return;
    lastNavAnimAt.current = now;

    const t = requestAnimationFrame(() => {
      mapRef.current?.animateToRegion(
        {
          latitude: trackedCoordinate.latitude,
          longitude: trackedCoordinate.longitude,
          latitudeDelta: NAV_DELTA,
          longitudeDelta: NAV_DELTA,
        },
        280
      );
    });
    return () => cancelAnimationFrame(t);
  }, [
    navigationMode,
    trackedCoordinate?.latitude,
    trackedCoordinate?.longitude,
  ]);

  const multi =
    routeAlternatives &&
    routeAlternatives.some((a) => a.coordinates.length > 1);

  const segmentColor = (
    segment: RouteSegmentPolyline,
    index: number
  ) => {
    if (segment.segmentType === "walk") return "#495057";
    const colors = ["#0B3D2E", "#0B4F8A", "#7A1FA2", "#B54708", "#8A1538"];
    return colors[index % colors.length];
  };

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
      initialRegion={region}
      showsUserLocation
      showsMyLocationButton={!navigationMode}
      loadingEnabled
      loadingIndicatorColor="#1B4332"
      loadingBackgroundColor="#e9ecef"
      rotateEnabled
      pitchEnabled={false}
    >
      {routeSegments?.length
        ?         routeSegments.map((segment, index) =>
            segment.coordinates.length > 1 ? (
              <Polyline
                key={`${routeRenderKey ?? "route"}:${segment.segmentId}`}
                coordinates={segment.coordinates}
                strokeColor={
                  selectedSegmentId === segment.segmentId
                    ? "#FFD43B"
                    : segmentColor(segment, index)
                }
                strokeWidth={
                  selectedSegmentId === segment.segmentId
                    ? 10
                    : navigationMode
                      ? 7
                      : 6
                }
                lineDashPattern={segment.segmentType === "walk" ? [8, 6] : undefined}
                lineCap="round"
                lineJoin="round"
                tappable
                onPress={() => onSegmentPress?.(segment)}
              />
            ) : null
          )
        : multi
        ? routeAlternatives!.map((alt) =>
            alt.coordinates.length > 1 ? (
              <Polyline
                key={alt.id}
                coordinates={alt.coordinates}
                strokeColor={alt.selected ? PRIMARY_LINE : ALT_LINE}
                strokeWidth={alt.selected ? 7 : 4}
                lineCap="round"
                lineJoin="round"
              />
            ) : null
          )
        : polylineCoordinates && polylineCoordinates.length > 1 ? (
            <Polyline
              coordinates={polylineCoordinates}
              strokeColor={PRIMARY_LINE}
              strokeWidth={navigationMode ? 7 : 6}
              lineCap="round"
              lineJoin="round"
            />
          ) : null}
      {destinationCoordinate ? (
        <>
          <Marker
            coordinate={destinationCoordinate}
            title="Destination"
            pinColor="#c92a2a"
          />
        </>
      ) : null}
    </MapView>
  );
}
