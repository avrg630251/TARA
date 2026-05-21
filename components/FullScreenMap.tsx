import { useEffect, useMemo, useRef } from "react";
import { Platform, StyleSheet } from "react-native";
import MapView, {
  Circle,
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  type Region,
} from "react-native-maps";

import type { LatLng } from "@/lib/googleMapsRoutes";

export type RouteAlternativePolyline = {
  coordinates: LatLng[];
  /** Highlighted alternative (typically user-selected chip). */
  selected: boolean;
};

type FullScreenMapProps = {
  latitude: number;
  longitude: number;
  /** Single-path mode (backward compatible). */
  polylineCoordinates?: LatLng[];
  /** Multiple paths — Google Maps-style alternates on one map. */
  routeAlternatives?: RouteAlternativePolyline[];
  destinationCoordinate?: LatLng | null;
  destinationRadiusMeters?: number;
  /** Bump to refit bounds (same coordinates, new selection). */
  fitSignal?: number;
  /** Live navigation: follow device position; disables route-wide fit. */
  navigationMode?: boolean;
  /** Latest fix while navigating (centers / animates map). */
  trackedCoordinate?: { latitude: number; longitude: number } | null;
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

const PRIMARY_LINE = "#1B4332";
const ALT_LINE = "rgba(100,116,139,0.42)";

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
  destinationCoordinate,
  destinationRadiusMeters,
  fitSignal,
  navigationMode = false,
  trackedCoordinate,
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
      collectCoordinates(
        polylineCoordinates,
        routeAlternatives,
        destinationCoordinate ?? null
      ),
    [
      polylineCoordinates,
      routeAlternatives,
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
      {multi
        ? routeAlternatives!.map((alt, idx) =>
            alt.coordinates.length > 1 ? (
              <Polyline
                key={`alt-${idx}`}
                coordinates={alt.coordinates}
                strokeColor={alt.selected ? PRIMARY_LINE : ALT_LINE}
                strokeWidth={alt.selected ? 6 : 3}
                lineCap="round"
                lineJoin="round"
              />
            ) : null
          )
        : polylineCoordinates && polylineCoordinates.length > 1 ? (
            <Polyline
              coordinates={polylineCoordinates}
              strokeColor={PRIMARY_LINE}
              strokeWidth={navigationMode ? 5 : 4}
              lineCap="round"
              lineJoin="round"
            />
          ) : null}
      {destinationCoordinate ? (
        <>
          {destinationRadiusMeters &&
          destinationRadiusMeters > 0 &&
          !navigationMode ? (
            <Circle
              center={destinationCoordinate}
              radius={destinationRadiusMeters}
              fillColor="rgba(27, 67, 50, 0.14)"
              strokeColor="rgba(27, 67, 50, 0.6)"
              strokeWidth={2}
            />
          ) : null}
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
