import { Platform, StyleSheet, View } from "react-native";
import MapView, { PROVIDER_GOOGLE, Region } from "react-native-maps";

export type MapPreviewProps = {
  latitude: number;
  longitude: number;
  height: number;
};

const DEFAULT_DELTA = 0.012;

export function MapPreview({ latitude, longitude, height }: MapPreviewProps) {
  const region: Region = {
    latitude,
    longitude,
    latitudeDelta: DEFAULT_DELTA,
    longitudeDelta: DEFAULT_DELTA,
  };

  return (
    <View style={[styles.wrap, { height }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        region={region}
        showsUserLocation
        showsMyLocationButton={false}
        scrollEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        zoomEnabled={false}
        toolbarEnabled={false}
        loadingEnabled
        loadingIndicatorColor="#1B4332"
        loadingBackgroundColor="#e9ecef"
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
