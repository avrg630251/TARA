import { StyleSheet, Text, View } from "react-native";

type MapPreviewProps = {
  latitude: number;
  longitude: number;
  height: number;
};

/** react-native-maps is not used on web; show a simple placeholder. */
export function MapPreview({ height }: MapPreviewProps) {
  return (
    <View style={[styles.box, { height }]}>
      <Text style={styles.text}>
        Map preview runs on the iOS and Android apps.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: "100%",
    borderRadius: 16,
    backgroundColor: "#e9ecef",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  text: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
  },
});
