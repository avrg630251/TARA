import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { LatLng } from "@/lib/googleMapsRoutes";
import type { DisplayRouteSegment } from "@/lib/transitPlanOptions";
import { loadGoogleMapsApi } from "@/lib/googleMapsWebLoader";

export type RouteAlternativePolyline = {
  id: string;
  coordinates: LatLng[];
  selected: boolean;
  comparisonLabel?: string;
  comparisonCoordinate?: LatLng;
};

export type RouteSegmentPolyline = DisplayRouteSegment;

type FullScreenMapProps = {
  latitude: number;
  longitude: number;
  polylineCoordinates?: LatLng[];
  routeAlternatives?: RouteAlternativePolyline[];
  routeSegments?: RouteSegmentPolyline[];
  routeRenderKey?: string | null;
  destinationCoordinate?: LatLng | null;
  fitSignal?: number;
  navigationMode?: boolean;
  trackedCoordinate?: { latitude: number; longitude: number } | null;
  selectedSegmentId?: string | null;
  onSegmentPress?: (segment: DisplayRouteSegment) => void;
  onAlternativePress?: (routeId: string) => void;
  fitEdgePadding?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
};

const PRIMARY_LINE = "#0B3D2E";
const ALT_LINE = "rgba(71, 85, 105, 0.75)";
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

function pickBestBubbleCoordinate(
  altCoords: LatLng[],
  primaryCoords?: LatLng[],
  bounds?: any
): LatLng {
  if (!altCoords || altCoords.length === 0) {
    return { latitude: 0, longitude: 0 };
  }
  if (altCoords.length <= 2) {
    return altCoords[0];
  }

  let candidateCoords = altCoords;
  if (bounds && typeof bounds.contains === "function") {
    const visible = altCoords.filter((c) =>
      bounds.contains({ lat: c.latitude, lng: c.longitude })
    );
    if (visible.length >= 2) {
      candidateCoords = visible;
    }
  }

  let pool = candidateCoords;
  if (candidateCoords.length >= 6) {
    const trim = Math.floor(candidateCoords.length * 0.15);
    pool = candidateCoords.slice(trim, candidateCoords.length - trim);
  }
  if (!pool.length) pool = candidateCoords;

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

function createComparisonOverlay(
  g: any,
  map: any,
  initialPosition: LatLng,
  label: string,
  onClick?: () => void
) {
  const overlay = new g.maps.OverlayView();
  let div: HTMLDivElement | null = null;
  let currentPos = initialPosition;

  overlay.onAdd = function () {
    div = document.createElement("div");
    div.style.position = "absolute";
    div.style.cursor = "pointer";
    div.style.backgroundColor = "#ffffff";
    div.style.color = "#1e293b";
    div.style.border = "1.5px solid #cbd5e1";
    div.style.borderRadius = "14px";
    div.style.padding = "6px 12px";
    div.style.fontSize = "12px";
    div.style.fontWeight = "700";
    div.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    div.style.boxShadow = "0 3px 10px rgba(0,0,0,0.18)";
    div.style.whiteSpace = "nowrap";
    div.style.userSelect = "none";
    div.style.zIndex = "1000";
    div.style.transform = "translate(-50%, -50%)";
    div.style.transition = "transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease";
    div.innerText = label;

    div.addEventListener("mouseenter", () => {
      if (div) {
        div.style.transform = "translate(-50%, -50%) scale(1.05)";
        div.style.boxShadow = "0 6px 16px rgba(0,0,0,0.25)";
        div.style.borderColor = "#0B3D2E";
      }
    });
    div.addEventListener("mouseleave", () => {
      if (div) {
        div.style.transform = "translate(-50%, -50%)";
        div.style.boxShadow = "0 3px 10px rgba(0,0,0,0.18)";
        div.style.borderColor = "#cbd5e1";
      }
    });

    if (onClick) {
      div.addEventListener("click", (e) => {
        e.stopPropagation();
        onClick();
      });
    }

    const panes = overlay.getPanes();
    panes?.overlayMouseTarget?.appendChild(div);
  };

  overlay.draw = function () {
    if (!div) return;
    const projection = overlay.getProjection();
    if (!projection) return;
    const point = projection.fromLatLngToDivPixel(
      new g.maps.LatLng(currentPos.latitude, currentPos.longitude)
    );
    if (point) {
      div.style.left = `${Math.round(point.x)}px`;
      div.style.top = `${Math.round(point.y)}px`;
    }
  };

  overlay.onRemove = function () {
    if (div && div.parentNode) {
      div.parentNode.removeChild(div);
      div = null;
    }
  };

  overlay.setPosition = function (newPos: LatLng) {
    currentPos = newPos;
    overlay.draw();
  };

  overlay.setMap(map);
  return overlay;
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
}: FullScreenMapProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const polylinesRef = useRef<any[]>([]);
  const markersRef = useRef<any[]>([]);
  const comparisonOverlaysRef = useRef<
    { overlay: any; alt: RouteAlternativePolyline }[]
  >([]);
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
    let cancelled = false;
    loadGoogleMapsApi()
      .then(() => {
        if (cancelled || !hostRef.current) return;
        const g = (window as any).google;
        if (!mapRef.current && g?.maps) {
          const map = new g.maps.Map(hostRef.current, {
            center: { lat: latitude, lng: longitude },
            zoom: navigationMode ? NAV_ZOOM : 14,
            disableDefaultUI: true,
            clickableIcons: false,
            gestureHandling: "greedy",
          });
          mapRef.current = map;
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || "Failed to load Google Maps");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !(window as any).google?.maps) return;
    const g = (window as any).google;
    const map = mapRef.current;

    for (const pl of polylinesRef.current) pl.setMap(null);
    polylinesRef.current = [];
    for (const m of markersRef.current) {
      if (typeof m.setMap === "function") m.setMap(null);
      else if (typeof m.close === "function") m.close();
    }
    markersRef.current = [];
    for (const entry of comparisonOverlaysRef.current) {
      entry.overlay.setMap(null);
    }
    comparisonOverlaysRef.current = [];

    const hasAlts =
      routeAlternatives && routeAlternatives.some((r) => r.coordinates.length > 1);
    const selectedAlt = routeAlternatives?.find((a) => a.selected);
    const hasSegments = Boolean(routeSegments && routeSegments.length > 0);

    const segmentColor = (
      segment: RouteSegmentPolyline,
      index: number
    ) => {
      if (segment.segmentType === "walk") return "#6B7280";
      if (segment.segmentType === "tricycle") return "#D97706";
      if (segment.segmentType === "bus") return "#7E22CE";
      if (segment.segmentType === "jeepney") return "#0284C7";
      const palette = ["#0284C7", "#D97706", "#7E22CE", "#059669", "#DC2626"];
      return palette[index % palette.length];
    };

    if (hasAlts) {
      for (const alt of routeAlternatives ?? []) {
        if (alt.coordinates.length < 2) continue;

        // If this is the selected route AND we have segments, do NOT draw a solid green line
        // over the route so it remains segmented and colored!
        if (alt.selected && hasSegments) {
          continue;
        }

        const polyline = new g.maps.Polyline({
          map,
          path: alt.coordinates.map((c: LatLng) => ({
            lat: c.latitude,
            lng: c.longitude,
          })),
          strokeColor: alt.selected ? PRIMARY_LINE : ALT_LINE,
          strokeOpacity: alt.selected ? 1 : 0.85,
          strokeWeight: alt.selected ? 7 : 5,
          zIndex: alt.selected ? 20 : 10,
        });
        polyline.addListener("click", () => onAlternativePress?.(alt.id));
        polylinesRef.current.push(polyline);

        if (!alt.selected && alt.comparisonLabel && alt.coordinates.length > 1) {
          const initialCoord = pickBestBubbleCoordinate(
            alt.coordinates,
            selectedAlt?.coordinates
          );
          const overlay = createComparisonOverlay(
            g,
            map,
            initialCoord,
            alt.comparisonLabel,
            () => onAlternativePress?.(alt.id)
          );
          comparisonOverlaysRef.current.push({
            overlay,
            alt,
          });
        }
      }
    } else if (!hasSegments && polylineCoordinates && polylineCoordinates.length > 1) {
      const polyline = new g.maps.Polyline({
        map,
        path: polylineCoordinates.map((c) => ({ lat: c.latitude, lng: c.longitude })),
        strokeColor: PRIMARY_LINE,
        strokeOpacity: 1,
        strokeWeight: navigationMode ? 7 : 6,
        zIndex: 20,
      });
      polylinesRef.current.push(polyline);
    }

    if (routeSegments?.length) {
      for (const [index, segment] of routeSegments.entries()) {
        if (segment.coordinates.length < 2) continue;
        const isWalk = segment.segmentType === "walk";
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
          strokeOpacity: isWalk ? 0 : 1,
          strokeWeight:
            selectedSegmentId === segment.segmentId
              ? 10
              : navigationMode
                ? 7
                : 6,
          zIndex: selectedSegmentId === segment.segmentId ? 45 : 30,
          icons: isWalk
            ? [
                {
                  icon: {
                    path: g.maps.SymbolPath.CIRCLE,
                    fillColor:
                      selectedSegmentId === segment.segmentId
                        ? "#FFD43B"
                        : "#495057",
                    fillOpacity: 1,
                    strokeColor:
                      selectedSegmentId === segment.segmentId
                        ? "#FFD43B"
                        : "#495057",
                    strokeOpacity: 1,
                    scale: 2.5,
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
    }

    if (destinationCoordinate) {
      const destinationMarker = new g.maps.Marker({
        map,
        position: {
          lat: destinationCoordinate.latitude,
          lng: destinationCoordinate.longitude,
        },
        title: "Destination",
        zIndex: 900,
      });
      markersRef.current.push(destinationMarker);
    }

    const activeTracked = trackedCoordinate ?? { latitude, longitude };
    if (
      activeTracked &&
      Number.isFinite(activeTracked.latitude) &&
      Number.isFinite(activeTracked.longitude)
    ) {
      const trackedMarker = new g.maps.Marker({
        map,
        position: { lat: activeTracked.latitude, lng: activeTracked.longitude },
        title: "Your location",
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#1a73e8",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
        zIndex: 1000,
      });
      markersRef.current.push(trackedMarker);
      if (navigationMode) {
        map.panTo({ lat: activeTracked.latitude, lng: activeTracked.longitude });
        map.setZoom(NAV_ZOOM);
        return;
      }
    }

    if (fitCoords.length >= 2 && !navigationMode) {
      map.fitBounds(toBounds(g, fitCoords), 46);
    } else {
      map.setCenter({ lat: latitude, lng: longitude });
    }

    const updateComparisonPositions = () => {
      const bounds = map.getBounds();
      if (!bounds) return;
      for (const entry of comparisonOverlaysRef.current) {
        const newCoord = pickBestBubbleCoordinate(
          entry.alt.coordinates,
          selectedAlt?.coordinates,
          bounds
        );
        entry.overlay.setPosition(newCoord);
      }
    };

    updateComparisonPositions();
    const idleListener = map.addListener("idle", updateComparisonPositions);

    return () => {
      idleListener.remove();
      for (const pl of polylinesRef.current) pl.setMap(null);
      polylinesRef.current = [];
      for (const m of markersRef.current) {
        if (typeof m.setMap === "function") m.setMap(null);
        else if (typeof m.close === "function") m.close();
      }
      markersRef.current = [];
      for (const entry of comparisonOverlaysRef.current) {
        entry.overlay.setMap(null);
      }
      comparisonOverlaysRef.current = [];
    };
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
    routeRenderKey,
    selectedSegmentId,
    onSegmentPress,
    onAlternativePress,
  ]);

  return (
    <View style={styles.container}>
      <div ref={hostRef} style={{ width: "100%", height: "100%" }} />
      {error ? (
        <View style={styles.errorOverlay} pointerEvents="none">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: "100%",
    backgroundColor: "#e9ecef",
    position: "relative",
  },
  errorOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: {
    color: "#c92a2a",
    fontSize: 14,
    textAlign: "center",
  },
});
