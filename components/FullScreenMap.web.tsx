import { StyleSheet, Text, View } from "react-native";

import type { LatLng } from "@/lib/googleMapsRoutes";

/** Mirror native map props (see FullScreenMap.tsx). */
type RouteAlternativePolyline = {
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

export function FullScreenMap(_props: FullScreenMapProps) {
  return (
    <View style={styles.fallback}>
      <Text style={styles.text}>Map is available on iOS and Android.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#dee2e6",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  text: {
    color: "#495057",
    fontSize: 15,
    textAlign: "center",
  },
});
