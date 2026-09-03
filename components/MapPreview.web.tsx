import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { loadGoogleMapsApi } from "@/lib/googleMapsWebLoader";

export type MapPreviewProps = {
  latitude: number;
  longitude: number;
  height: number;
};

const PREVIEW_ZOOM = 15;

export function MapPreview({ latitude, longitude, height }: MapPreviewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);

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
            zoom: PREVIEW_ZOOM,
            disableDefaultUI: true,
            gestureHandling: "none",
            draggable: false,
            keyboardShortcuts: false,
            fullscreenControl: false,
            mapTypeControl: false,
            streetViewControl: false,
          });
        }
        mapRef.current.setCenter({ lat: latitude, lng: longitude });

        if (!markerRef.current) {
          markerRef.current = new g.maps.Marker({
            map: mapRef.current,
            position: { lat: latitude, lng: longitude },
            title: "Current location",
          });
        } else {
          markerRef.current.setPosition({ lat: latitude, lng: longitude });
        }
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Map preview failed to load.");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [latitude, longitude]);

  return (
    <View style={[styles.wrap, { height }]}>
      <div ref={hostRef} style={styles.webMap as any} />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#e9ecef",
    position: "relative",
  },
  webMap: {
    width: "100%",
    height: "100%",
  },
  errorText: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    fontSize: 12,
    color: "#b02a37",
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
