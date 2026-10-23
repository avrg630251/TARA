import { useEffect, useMemo, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import MapView, {
  Marker,
  Polyline,
  type Region,
} from "react-native-maps";
import { WebView } from "react-native-webview";

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
const GOOGLE_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";

function androidMapHtml(
  latitude: number,
  longitude: number,
  routeSegments: RouteSegmentPolyline[] | undefined,
  routeAlternatives: RouteAlternativePolyline[] | undefined,
  polylineCoordinates: LatLng[] | undefined,
  destinationCoordinate: LatLng | null | undefined,
  navigationMode: boolean,
  trackedCoordinate: { latitude: number; longitude: number } | null | undefined
) {
  const payload = JSON.stringify({
    center: { latitude, longitude },
    routeSegments,
    routeAlternatives,
    polylineCoordinates,
    destinationCoordinate,
    navigationMode,
    trackedCoordinate,
  });
  return `<!doctype html><html><body style="margin:0"><div id="map"></div>
<script>
  const data = ${payload};
  const colors = ["#0B3D2E", "#0B4F8A", "#7A1FA2", "#B54708", "#8A1538"];
  function point(c) { return { lat: c.latitude, lng: c.longitude }; }
  function init() {
    const center = point(data.trackedCoordinate || data.center);
    const map = new google.maps.Map(document.getElementById("map"), {
      center, zoom: data.navigationMode ? 16 : 14,
      disableDefaultUI: true, clickableIcons: false
    });
    const bounds = new google.maps.LatLngBounds();
    let count = 0;
    function drawLine(coords, options, message) {
      if (!coords || coords.length < 2) return;
      coords.forEach(c => { bounds.extend(point(c)); count++; });
      const line = new google.maps.Polyline({ map, path: coords.map(point), ...options });
      if (message) line.addListener("click", () =>
        window.ReactNativeWebView.postMessage(JSON.stringify(message)));
    }
    if (data.routeAlternatives && data.routeAlternatives.length) {
      data.routeAlternatives.forEach(alt => drawLine(alt.coordinates, {
        strokeColor: alt.selected ? "#0B3D2E" : "rgba(51,65,85,0.72)",
        strokeOpacity: 1, strokeWeight: alt.selected ? 7 : 4
      }, { type: "alternative", id: alt.id }));
    } else if (!data.routeSegments || !data.routeSegments.length) {
      drawLine(data.polylineCoordinates, {
        strokeColor: "#0B3D2E", strokeOpacity: 1,
        strokeWeight: data.navigationMode ? 7 : 6
      });
    }
    if (data.routeSegments && data.routeSegments.length) {
      data.routeSegments.forEach((segment, index) => drawLine(segment.coordinates, {
        strokeColor: segment.segmentType === "walk" ? "#495057" : colors[index % colors.length],
        strokeOpacity: 1, strokeWeight: 6,
        icons: segment.segmentType === "walk" ? [{
          icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: "#495057",
            fillOpacity: 1, strokeColor: "#495057", strokeOpacity: 1, scale: 2.5 },
          offset: "0", repeat: "12px"
        }] : undefined
      }, { type: "segment", id: segment.segmentId }));
    }
    if (data.destinationCoordinate) {
      const destination = point(data.destinationCoordinate);
      new google.maps.Marker({ map, position: destination, title: "Destination" });
      bounds.extend(destination); count++;
    }
    const tracked = data.trackedCoordinate || data.center;
    new google.maps.Marker({ map, position: point(tracked), title: "Your location" });
    if (data.navigationMode) {
      map.setCenter(point(tracked)); map.setZoom(16);
    } else if (count > 1) {
      map.fitBounds(bounds, 46);
    } else {
      map.setCenter(center);
    }
  }
</script>
<script async src="https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_KEY)}&callback=init"></script>
<style>html,body,#map{width:100%;height:100%;overflow:hidden}</style></body></html>`;
}

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

  if (Platform.OS === "android") {
    const html = androidMapHtml(
      latitude,
      longitude,
      routeSegments,
      routeAlternatives,
      polylineCoordinates,
      destinationCoordinate,
      navigationMode,
      trackedCoordinate
    );
    return (
      <View style={StyleSheet.absoluteFill}>
        <WebView
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          source={{ html }}
          style={StyleSheet.absoluteFill}
          onMessage={(event) => {
            try {
              const message = JSON.parse(event.nativeEvent.data) as {
                type?: string;
                id?: string;
              };
              if (message.type === "segment" && message.id) {
                const segment = routeSegments?.find(
                  (candidate) => candidate.segmentId === message.id
                );
                if (segment) onSegmentPress?.(segment);
              }
            } catch {
              // Ignore malformed messages from the embedded map.
            }
          }}
        />
      </View>
    );
  }

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
      {routeSegments?.length
        ? routeSegments.map((segment, index) =>
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
        : null}
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
