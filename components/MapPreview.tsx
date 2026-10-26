import { StyleSheet, View } from "react-native";

import { FullScreenMap } from "@/components/FullScreenMap";

export type MapPreviewProps = {
  latitude: number;
  longitude: number;
  height: number;
};

export function MapPreview({ latitude, longitude, height }: MapPreviewProps) {
  return (
    <View style={[styles.wrap, { height }]}>
      <FullScreenMap
        latitude={latitude}
        longitude={longitude}
        trackedCoordinate={{ latitude, longitude }}
        routeRenderKey="home-preview"
        fitSignal={0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#e9ecef",
  },
});
