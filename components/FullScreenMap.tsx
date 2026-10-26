import { type ElementRef, useCallback, useEffect, useMemo, useRef } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, {
  Marker,
  Polyline,
  type Region,
} from "react-native-maps";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import type { LatLng } from "@/lib/googleMapsRoutes";
import type { DisplayRouteSegment } from "@/lib/transitPlanOptions";

export type RouteAlternativePolyline = {
  id: string;
  coordinates: LatLng[];
  /** Highlighted alternative (typically user-selected chip). */
  selected: boolean;
  comparisonLabel?: string;
  comparisonCoordinate?: LatLng;
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
  onAlternativePress?: (routeId: string) => void;
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
const ALT_LINE = "rgba(71, 85, 105, 0.75)";
const GOOGLE_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";

function pickBestBubbleCoordinate(
  altCoords: LatLng[],
  primaryCoords?: LatLng[]
): LatLng {
  if (!altCoords || altCoords.length === 0) {
    return { latitude: 0, longitude: 0 };
  }
  if (altCoords.length <= 2) {
    return altCoords[0];
  }

  let pool = altCoords;
  if (altCoords.length >= 6) {
    const trim = Math.floor(altCoords.length * 0.15);
    pool = altCoords.slice(trim, altCoords.length - trim);
  }
  if (!pool.length) pool = altCoords;

  if (primaryCoords && primaryCoords.length > 1) {
    let bestPoint = pool[Math.floor(pool.length / 2)];
    let maxMinDist = -1;

    for (const pt of pool) {
      let minDist = Infinity;
      const step = Math.max(1, Math.floor(primaryCoords.length / 30));
      for (let i = 0; i < primaryCoords.length; i += step) {
        const primPt = primaryCoords[i];
        const d =
          Math.abs(pt.latitude - primPt.latitude) +
          Math.abs(pt.longitude - primPt.longitude);
        if (d < minDist) minDist = d;
      }
      if (minDist > maxMinDist) {
        maxMinDist = minDist;
        bestPoint = pt;
      }
    }

    if (maxMinDist > 0.0002) {
      return bestPoint;
    }
  }

  return pool[Math.floor(pool.length / 2)];
}

function generateAndroidMapHtml() {
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>html,body,#map{width:100%;height:100%;margin:0;padding:0;overflow:hidden;background-color:#e9ecef;}</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = null;
  var trackedMarker = null;
  var destinationMarker = null;
  var polylines = [];
  var comparisonOverlays = [];
  var comparisonIdleListener = null;
  var isReady = false;
  var pendingData = null;
  var lastFitSignal = null;
  var lastRouteRenderKey = null;

  function point(c) { return { lat: c.latitude, lng: c.longitude }; }

  function clearPolylines() {
    for (var i = 0; i < polylines.length; i++) {
      polylines[i].setMap(null);
    }
    polylines = [];
    for (var w = 0; w < comparisonOverlays.length; w++) {
      comparisonOverlays[w].overlay.setMap(null);
    }
    comparisonOverlays = [];
  }

  function pickBestCoordinate(altCoords, primaryCoords, bounds) {
    if (!altCoords || !altCoords.length) return { latitude: 0, longitude: 0 };
    if (altCoords.length <= 2) return altCoords[0];
    var candidateCoords = altCoords;
    if (bounds && typeof bounds.contains === "function") {
      var visible = altCoords.filter(function(c) {
        return bounds.contains(point(c));
      });
      if (visible.length >= 2) candidateCoords = visible;
    }
    var pool = candidateCoords;
    if (candidateCoords.length >= 6) {
      var trim = Math.floor(candidateCoords.length * 0.15);
      pool = candidateCoords.slice(trim, candidateCoords.length - trim);
    }
    if (!pool.length) pool = candidateCoords;

    if (primaryCoords && primaryCoords.length > 1) {
      var bestPt = pool[Math.floor(pool.length / 2)];
      var maxMinDist = -1;
      var step = Math.max(1, Math.floor(primaryCoords.length / 30));
      for (var i = 0; i < pool.length; i++) {
        var pt = pool[i];
        var minDist = 999999;
        for (var j = 0; j < primaryCoords.length; j += step) {
          var prim = primaryCoords[j];
          var d = Math.abs(pt.latitude - prim.latitude) + Math.abs(pt.longitude - prim.longitude);
          if (d < minDist) minDist = d;
        }
        if (minDist > maxMinDist) {
          maxMinDist = minDist;
          bestPt = pt;
        }
      }
      if (maxMinDist > 0.0002) return bestPt;
    }
    return pool[Math.floor(pool.length / 2)];
  }

  function createComparisonOverlay(mapInstance, initialPos, label, altId) {
    var overlay = new google.maps.OverlayView();
    var div = null;
    var currentPos = initialPos;

    overlay.onAdd = function() {
      div = document.createElement("div");
      div.style.position = "absolute";
      div.style.backgroundColor = "#ffffff";
      div.style.color = "#1e293b";
      div.style.border = "1.5px solid #cbd5e1";
      div.style.borderRadius = "14px";
      div.style.padding = "6px 12px";
      div.style.fontSize = "12px";
      div.style.fontWeight = "700";
      div.style.fontFamily = "sans-serif";
      div.style.boxShadow = "0 3px 10px rgba(0,0,0,0.22)";
      div.style.whiteSpace = "nowrap";
      div.style.userSelect = "none";
      div.style.zIndex = "1000";
      div.style.transform = "translate(-50%, -50%)";
      div.innerText = label;

      div.addEventListener("click", function(e) {
        e.stopPropagation();
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: "alternative", id: altId }));
        }
      });

      var panes = overlay.getPanes();
      if (panes && panes.overlayMouseTarget) {
        panes.overlayMouseTarget.appendChild(div);
      }
    };

    overlay.draw = function() {
      if (!div) return;
      var proj = overlay.getProjection();
      if (!proj) return;
      var pt = proj.fromLatLngToDivPixel(new google.maps.LatLng(currentPos.latitude, currentPos.longitude));
      if (pt) {
        div.style.left = Math.round(pt.x) + "px";
        div.style.top = Math.round(pt.y) + "px";
      }
    };

    overlay.onRemove = function() {
      if (div && div.parentNode) {
        div.parentNode.removeChild(div);
        div = null;
      }
    };

    overlay.setPosition = function(newPos) {
      currentPos = newPos;
      overlay.draw();
    };

    overlay.setMap(mapInstance);
    return overlay;
  }

  function segmentColor(segment, idx) {
    if (segment.segmentType === "walk") return "#6B7280";
    if (segment.segmentType === "tricycle") return "#D97706";
    if (segment.segmentType === "bus") return "#7E22CE";
    if (segment.segmentType === "jeepney") return "#0284C7";
    var palette = ["#0284C7", "#D97706", "#7E22CE", "#059669", "#DC2626"];
    return palette[idx % palette.length];
  }

  function init() {
    try {
      map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 14.5995, lng: 120.9842 },
        zoom: 14,
        disableDefaultUI: true,
        clickableIcons: false,
        gestureHandling: "greedy"
      });

      trackedMarker = new google.maps.Marker({
        map: null,
        title: "Your location",
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#1a73e8",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3
        },
        zIndex: 1000
      });

      destinationMarker = new google.maps.Marker({
        map: null,
        title: "Destination",
        zIndex: 900
      });

      isReady = true;
      if (pendingData) {
        window.updateMapData(pendingData);
        pendingData = null;
      }
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "ready" }));
      }
    } catch (e) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "error", message: e.message }));
      }
    }
  }

  window.updateMapData = function(data) {
    if (!isReady || !map) {
      pendingData = data;
      return;
    }

    var tracked = data.trackedCoordinate || (data.navigationMode ? null : data.center);
    if (tracked && Number.isFinite(tracked.latitude) && Number.isFinite(tracked.longitude)) {
      var pos = point(tracked);
      trackedMarker.setPosition(pos);
      if (!trackedMarker.getMap()) {
        trackedMarker.setMap(map);
      }
      if (data.navigationMode) {
        map.panTo(pos);
        map.setZoom(16);
      }
    } else {
      trackedMarker.setMap(null);
    }

    if (data.destinationCoordinate && Number.isFinite(data.destinationCoordinate.latitude) && Number.isFinite(data.destinationCoordinate.longitude)) {
      var destPt = point(data.destinationCoordinate);
      destinationMarker.setPosition(destPt);
      if (!destinationMarker.getMap()) {
        destinationMarker.setMap(map);
      }
    } else {
      destinationMarker.setMap(null);
    }

    clearPolylines();
    var bounds = new google.maps.LatLngBounds();
    var count = 0;

    function drawLine(coords, options, message) {
      if (!coords || coords.length < 2) return;
      for (var i = 0; i < coords.length; i++) {
        bounds.extend(point(coords[i]));
        count++;
      }
      var line = new google.maps.Polyline(Object.assign({ map: map, path: coords.map(point) }, options));
      if (message) {
        line.addListener("click", function() {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify(message));
          }
        });
      }
      polylines.push(line);
    }

    var hasSegments = Boolean(data.routeSegments && data.routeSegments.length);
    var selectedAlt = null;

    if (data.routeAlternatives && data.routeAlternatives.length) {
      for (var sIdx = 0; sIdx < data.routeAlternatives.length; sIdx++) {
        if (data.routeAlternatives[sIdx].selected) {
          selectedAlt = data.routeAlternatives[sIdx];
          break;
        }
      }

      for (var a = 0; a < data.routeAlternatives.length; a++) {
        var alt = data.routeAlternatives[a];

        // Skip drawing solid green line if segments are present so colors remain visible!
        if (alt.selected && hasSegments) {
          continue;
        }

        drawLine(alt.coordinates, {
          strokeColor: alt.selected ? "#0B3D2E" : "rgba(71, 85, 105, 0.75)",
          strokeOpacity: alt.selected ? 1 : 0.85,
          strokeWeight: alt.selected ? 7 : 5,
          zIndex: alt.selected ? 20 : 10
        }, { type: "alternative", id: alt.id });

        if (!alt.selected && alt.comparisonLabel && alt.coordinates.length > 1) {
          var initialCoord = pickBestCoordinate(
            alt.coordinates,
            selectedAlt ? selectedAlt.coordinates : null
          );
          var overlay = createComparisonOverlay(map, initialCoord, alt.comparisonLabel, alt.id);
          comparisonOverlays.push({ overlay: overlay, alt: alt });
        }
      }
    } else if (!hasSegments && data.polylineCoordinates && data.polylineCoordinates.length > 1) {
      drawLine(data.polylineCoordinates, {
        strokeColor: "#0B3D2E",
        strokeOpacity: 1,
        strokeWeight: data.navigationMode ? 7 : 6,
        zIndex: 20
      });
    }

    if (hasSegments) {
      for (var s = 0; s < data.routeSegments.length; s++) {
        var segment = data.routeSegments[s];
        var isSelected = data.selectedSegmentId === segment.segmentId;
        var isWalk = segment.segmentType === "walk";
        var stroke = isSelected ? "#FFD43B" : segmentColor(segment, s);
        var weight = isSelected ? 10 : (data.navigationMode ? 7 : 6);
        var lineOptions = {
          strokeColor: stroke,
          strokeOpacity: isWalk ? 0 : 1,
          strokeWeight: weight,
          zIndex: isSelected ? 60 : 35
        };
        if (isWalk) {
          lineOptions.icons = [{
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: isSelected ? "#FFD43B" : "#495057",
              fillOpacity: 1,
              strokeColor: isSelected ? "#FFD43B" : "#495057",
              strokeOpacity: 1,
              scale: 2.5
            },
            offset: "0",
            repeat: "12px"
          }];
        }
        drawLine(segment.coordinates, lineOptions, { type: "segment", id: segment.segmentId });
      }
    }

    if (data.destinationCoordinate && Number.isFinite(data.destinationCoordinate.latitude) && Number.isFinite(data.destinationCoordinate.longitude)) {
      bounds.extend(point(data.destinationCoordinate));
      count++;
    }

    if (!data.navigationMode) {
      var shouldFit =
        lastFitSignal === null ||
        data.fitSignal !== lastFitSignal ||
        (data.routeRenderKey && data.routeRenderKey !== lastRouteRenderKey);

      if (shouldFit) {
        if (count > 1) {
          map.fitBounds(bounds, data.fitEdgePadding || 46);
        } else if (tracked) {
          map.setCenter(point(tracked));
        }
        lastFitSignal = data.fitSignal;
        lastRouteRenderKey = data.routeRenderKey;
      }
    }

    function updateComparisonPositions() {
      if (!map || !comparisonOverlays.length) return;
      var visibleBounds = map.getBounds();
      if (!visibleBounds) return;
      for (var c = 0; c < comparisonOverlays.length; c++) {
        var entry = comparisonOverlays[c];
        var newCoord = pickBestCoordinate(
          entry.alt.coordinates,
          selectedAlt ? selectedAlt.coordinates : null,
          visibleBounds
        );
        entry.overlay.setPosition(newCoord);
      }
    }

    updateComparisonPositions();
    if (comparisonIdleListener) comparisonIdleListener.remove();
    comparisonIdleListener = map.addListener("idle", updateComparisonPositions);
  };
</script>
<script async src="https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_KEY)}&callback=init"></script>
</body></html>`;
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
    for (const c of legacy) out.push(c);
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
  onAlternativePress,
  fitEdgePadding = DEFAULT_PADDING,
}: FullScreenMapProps) {
  const mapRef = useRef<MapView>(null);

  const region: Region = useMemo(
    () => ({
      latitude,
      longitude,
      latitudeDelta: navigationMode ? NAV_DELTA : DELTA,
      longitudeDelta: navigationMode ? NAV_DELTA : DELTA,
    }),
    [latitude, longitude, navigationMode]
  );

  const fitCoords = useMemo(
    () =>
      [
        ...(routeSegments?.flatMap((segment) => segment.coordinates) ?? []),
        ...collectCoordinates(
          polylineCoordinates,
          routeAlternatives,
          destinationCoordinate
        ),
      ],
    [polylineCoordinates, routeAlternatives, routeSegments, destinationCoordinate]
  );

  useEffect(() => {
    if (Platform.OS === "android") return;
    if (navigationMode) return;
    if (fitCoords.length < 2) return;
    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(fitCoords, {
        edgePadding: fitEdgePadding,
        animated: true,
      });
    }, 120);
    return () => clearTimeout(t);
  }, [fitCoords, fitEdgePadding, navigationMode, fitSignal, routeRenderKey]);

  useEffect(() => {
    if (Platform.OS === "android") return;
    if (!navigationMode || !trackedCoordinate) return;
    mapRef.current?.animateToRegion(
      {
        latitude: trackedCoordinate.latitude,
        longitude: trackedCoordinate.longitude,
        latitudeDelta: NAV_DELTA,
        longitudeDelta: NAV_DELTA,
      },
      400
    );
  }, [navigationMode, trackedCoordinate]);

  const multi =
    routeAlternatives &&
    routeAlternatives.some((a) => a.coordinates.length > 1);

  const webViewRef = useRef<ElementRef<typeof WebView>>(null);
  const isWebReadyRef = useRef(false);
  const latestDataRef = useRef<Record<string, unknown> | null>(null);

  const androidSource = useMemo(() => ({ html: generateAndroidMapHtml() }), []);

  const sendDataToWebView = useCallback((data: Record<string, unknown>) => {
    latestDataRef.current = data;
    if (isWebReadyRef.current && webViewRef.current) {
      const script = `if (window.updateMapData) { window.updateMapData(${JSON.stringify(data)}); } true;`;
      webViewRef.current.injectJavaScript(script);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const payload = {
      center: { latitude, longitude },
      routeSegments,
      routeAlternatives,
      polylineCoordinates,
      destinationCoordinate,
      navigationMode,
      trackedCoordinate,
      selectedSegmentId,
      fitSignal,
      routeRenderKey,
      fitEdgePadding,
    };
    sendDataToWebView(payload);
  }, [
    latitude,
    longitude,
    routeSegments,
    routeAlternatives,
    polylineCoordinates,
    destinationCoordinate,
    navigationMode,
    trackedCoordinate?.latitude,
    trackedCoordinate?.longitude,
    selectedSegmentId,
    fitSignal,
    routeRenderKey,
    fitEdgePadding,
    sendDataToWebView,
  ]);

  const handleAndroidMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const message = JSON.parse(event.nativeEvent.data) as {
          type?: string;
          id?: string;
        };
        if (message.type === "ready") {
          isWebReadyRef.current = true;
          if (latestDataRef.current) {
            sendDataToWebView(latestDataRef.current);
          }
        } else if (message.type === "segment" && message.id) {
          const segment = routeSegments?.find(
            (candidate) => candidate.segmentId === message.id
          );
          if (segment) onSegmentPress?.(segment);
        } else if (message.type === "alternative" && message.id) {
          onAlternativePress?.(message.id);
        }
      } catch {
        // Ignore malformed messages from the embedded map.
      }
    },
    [routeSegments, onSegmentPress, onAlternativePress, sendDataToWebView]
  );

  if (Platform.OS === "android") {
    return (
      <View style={StyleSheet.absoluteFill}>
        <WebView
          ref={webViewRef}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          source={androidSource}
          style={StyleSheet.absoluteFill}
          onMessage={handleAndroidMessage}
        />
      </View>
    );
  }

  const segmentColor = (
    segment: RouteSegmentPolyline,
    index: number
  ) => {
    if (segment.segmentType === "walk") return "#6B7280";
    if (segment.segmentType === "tricycle") return "#D97706";
    if (segment.segmentType === "bus") return "#7E22CE";
    if (segment.segmentType === "jeepney") return "#0284C7";
    const colors = ["#0284C7", "#D97706", "#7E22CE", "#059669", "#DC2626"];
    return colors[index % colors.length];
  };

  const hasSegments = Boolean(routeSegments && routeSegments.length > 0);
  const selectedAlt = routeAlternatives?.find((a) => a.selected);

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
        ? routeAlternatives!.map((alt) => {
            if (alt.coordinates.length < 2) return null;
            if (alt.selected && hasSegments) return null;
            return (
              <Polyline
                key={alt.id}
                coordinates={alt.coordinates}
                strokeColor={alt.selected ? PRIMARY_LINE : ALT_LINE}
                strokeWidth={alt.selected ? 7 : 5}
                lineCap="round"
                lineJoin="round"
                tappable
                onPress={() => onAlternativePress?.(alt.id)}
              />
            );
          })
        : polylineCoordinates && polylineCoordinates.length > 1 && !hasSegments ? (
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
      {routeAlternatives
        ?.filter((alt) => !alt.selected && alt.comparisonLabel && alt.coordinates.length > 1)
        .map((alt) => {
          const coordinate = pickBestBubbleCoordinate(
            alt.coordinates,
            selectedAlt?.coordinates
          );
          return (
            <Marker
              key={`${alt.id}:comparison`}
              coordinate={coordinate}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              onPress={() => onAlternativePress?.(alt.id)}
            >
              <Pressable
                onPress={() => onAlternativePress?.(alt.id)}
                style={comparisonBubbleStyles.bubble}
              >
                <Text style={comparisonBubbleStyles.text}>
                  {alt.comparisonLabel}
                </Text>
              </Pressable>
            </Marker>
          );
        })}
      {destinationCoordinate ? (
        <Marker
          coordinate={destinationCoordinate}
          title="Destination"
          pinColor="#c92a2a"
        />
      ) : null}
    </MapView>
  );
}

const comparisonBubbleStyles = StyleSheet.create({
  bubble: {
    backgroundColor: "#fff",
    borderColor: "#cbd5e1",
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
  },
  text: {
    color: "#1e293b",
    fontSize: 12,
    fontWeight: "700",
  },
});
