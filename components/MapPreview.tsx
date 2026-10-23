import { Platform, StyleSheet, View } from "react-native";
import MapView, { Region } from "react-native-maps";
import { WebView } from "react-native-webview";

export type MapPreviewProps = {
  latitude: number;
  longitude: number;
  height: number;
};

const DEFAULT_DELTA = 0.012;
const GOOGLE_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";

function androidMapHtml(latitude: number, longitude: number) {
  const center = JSON.stringify({ lat: latitude, lng: longitude });
  return `<!doctype html><html><body style="margin:0"><div id="map"></div>
<script>
  function init() {
    const center = ${center};
    const map = new google.maps.Map(document.getElementById("map"), {
      center, zoom: 15, disableDefaultUI: true, gestureHandling: "none"
    });
    new google.maps.Marker({ map, position: center, title: "Current location" });
  }
</script>
<script async src="https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_KEY)}&callback=init"></script>
<style>html,body,#map{width:100%;height:100%;overflow:hidden}</style></body></html>`;
}

export function MapPreview({ latitude, longitude, height }: MapPreviewProps) {
  const region: Region = {
    latitude,
    longitude,
    latitudeDelta: DEFAULT_DELTA,
    longitudeDelta: DEFAULT_DELTA,
  };

  if (Platform.OS === "android") {
    return (
      <View style={[styles.wrap, { height }]}>
        <WebView
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          source={{ html: androidMapHtml(latitude, longitude) }}
          style={StyleSheet.absoluteFill}
        />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { height }]}>
      <MapView
        style={StyleSheet.absoluteFill}
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
