import { forwardRef, useImperativeHandle, useRef } from "react";
import type { ElementRef } from "react";
import { StyleSheet } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import type { PlaceSuggestion } from "@/lib/googleMapsRoutes";

export type AndroidPlaceAutocompleteHandle = {
  setQuery: (query: string, latitude: number, longitude: number) => void;
};

type Props = {
  onSuggestions: (suggestions: PlaceSuggestion[], error?: string) => void;
};

const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";

const html = `<!doctype html><html><body>
<script>
  let service;
  function send(value) {
    window.ReactNativeWebView.postMessage(JSON.stringify(value));
  }
  function init() {
    service = new google.maps.places.AutocompleteService();
    send({ type: "ready" });
  }
  function updateQuery(query, latitude, longitude) {
    if (!service) return;
    if (!query || query.trim().length < 2) {
      send({ type: "suggestions", items: [] });
      return;
    }
    service.getPlacePredictions({
      input: query,
      types: ["geocode", "establishment"],
      locationBias: {
        center: { lat: latitude, lng: longitude },
        radius: 30000
      }
    }, (predictions, status) => {
      if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
        send({ type: "suggestions", items: [] });
        return;
      }
      if (status !== google.maps.places.PlacesServiceStatus.OK) {
        send({ type: "error", message: "Suggestions failed: " + status });
        return;
      }
      send({
        type: "suggestions",
        items: (predictions || []).slice(0, 3).map(p => ({
          placeId: p.place_id,
          description: p.description,
          mainText: p.structured_formatting?.main_text || p.description,
          secondaryText: p.structured_formatting?.secondary_text || ""
        }))
      });
    });
  }
</script>
<script async src="https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&callback=init"></script>
</body></html>`;

export const AndroidPlaceAutocomplete = forwardRef<
  AndroidPlaceAutocompleteHandle,
  Props
>(function AndroidPlaceAutocomplete({ onSuggestions }, ref) {
  const webViewRef = useRef<ElementRef<typeof WebView>>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef<string | null>(null);

  useImperativeHandle(ref, () => ({
    setQuery(query, latitude, longitude) {
      const payload = JSON.stringify({ query, latitude, longitude });
      if (!readyRef.current) {
        pendingRef.current = payload;
        return;
      }
      webViewRef.current?.injectJavaScript(
        `updateQuery(${payload}.query, ${payload}.latitude, ${payload}.longitude); true;`
      );
    },
  }));

  const sendPending = () => {
    const payload = pendingRef.current;
    pendingRef.current = null;
    if (!payload) return;
    webViewRef.current?.injectJavaScript(
      `updateQuery(${payload}.query, ${payload}.latitude, ${payload}.longitude); true;`
    );
  };

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as {
        type: string;
        items?: PlaceSuggestion[];
        message?: string;
      };
      if (message.type === "ready") {
        readyRef.current = true;
        sendPending();
      } else if (message.type === "suggestions") {
        onSuggestions(message.items ?? []);
      } else if (message.type === "error") {
        onSuggestions([], message.message ?? "Could not load suggestions.");
      }
    } catch {
      onSuggestions([], "Could not read location suggestions.");
    }
  };

  return (
    <WebView
      ref={webViewRef}
      source={{ html }}
      originWhitelist={["*"]}
      javaScriptEnabled
      domStorageEnabled
      onLoadEnd={sendPending}
      onMessage={handleMessage}
      style={styles.hidden}
    />
  );
});

const styles = StyleSheet.create({
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
});
