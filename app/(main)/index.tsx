import { Ionicons } from "@expo/vector-icons";
import type { User } from "@supabase/supabase-js";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { MapPreview } from "@/components/MapPreview";
import { useAuth } from "@/contexts/AuthContext";
import { useTravel } from "@/contexts/TravelContext";
import { normalizeTravelFare } from "@/lib/transitRoutes";

const GREEN = "#1C5141";
const GREEN_HEADING = "#1C5141";
const SEARCH_BG = "#F7F7F7";

/** Metro area fallback when location permission is denied or unavailable. */
const FALLBACK_LAT = 14.5995;
const FALLBACK_LNG = 120.9842;

function displayNameFromSession(user: User | undefined): string {
  if (!user) return "there";
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const full =
    typeof meta?.full_name === "string"
      ? meta.full_name.trim()
      : typeof meta?.name === "string"
        ? (meta.name as string).trim()
        : "";
  if (full) return full.split(/\s+/)[0] ?? full;
  const email = user.email?.split("@")[0];
  return email || "there";
}

function formatTripDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function HomeScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { bookmarks } = useTravel();
  const bookmarkPreview = useMemo(() => bookmarks.slice(0, 6), [bookmarks]);
  const cardWidth = Math.min(320, Math.max(260, windowWidth * 0.78));

  const [latitude, setLatitude] = useState(FALLBACK_LAT);
  const [longitude, setLongitude] = useState(FALLBACK_LNG);
  const [locationStatus, setLocationStatus] = useState<
    "loading" | "ok" | "fallback"
  >("loading");

  const firstName = useMemo(
    () => displayNameFromSession(session?.user),
    [session?.user]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== "granted") {
          setLocationStatus("fallback");
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setLocationStatus("ok");
      } catch {
        if (!cancelled) setLocationStatus("fallback");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function openSearchWithRoute(origin: string, destination: string) {
    router.push({
      pathname: "/search",
      params: { origin, destination },
    });
  }

  const bottomPad = 12 + insets.bottom + 52;

  return (
    <View style={styles.root}>
      <View style={styles.headerShell}>
        <SafeAreaView edges={["top"]} style={styles.headerSafe}>
          <View style={styles.headerInner}>
            <Text style={styles.greeting}>Hello, {firstName}!</Text>
            <Text style={styles.tagline}>Tara! Saan tayo ngayon?</Text>

            <Pressable
              style={({ pressed }) => [
                styles.searchRow,
                pressed && styles.searchRowPressed,
              ]}
              onPress={() => router.push("/search")}
              accessibilityRole="button"
              accessibilityLabel="Open map search"
            >
              <Text style={styles.searchPlaceholder}>Search</Text>
              <Ionicons name="search" size={20} color="#495057" />
            </Pressable>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.mapSectionHeader}>
          <Text style={styles.mapSectionTitle}>Map Preview</Text>
          {locationStatus === "loading" ? (
            <ActivityIndicator size="small" color={GREEN} />
          ) : null}
        </View>

        <MapPreview latitude={latitude} longitude={longitude} height={220} />

        {locationStatus === "fallback" ? (
          <Text style={styles.locationHint}>
            Location off or unavailable — showing a default map area. Enable
            location in settings to see where you are.
          </Text>
        ) : null}

        <View style={styles.recentHeader}>
          <Text style={styles.recentTitle}>Bookmarked routes</Text>
          <Pressable
            hitSlop={8}
            onPress={() => router.push("/saved")}
            accessibilityRole="button"
            accessibilityLabel="Open trip history"
          >
            <Text style={styles.seeAll}>See all</Text>
          </Pressable>
        </View>

        {bookmarkPreview.length === 0 ? (
          <Text style={styles.recentEmpty}>
            Bookmarked routes will appear here after you save a route from
            Search.
          </Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recentCarousel}
          >
            {bookmarkPreview.map((t) => {
              const normalized = normalizeTravelFare({
                routeName: t.routeName,
                originLabel: t.originLabel,
                destinationLabel: t.destinationLabel,
                boardStop: t.boardStop,
                offStop: t.offStop,
                fareText: t.fareText,
                fareValue: t.fareValue,
                segments: t.segments,
                polyline: t.polyline,
              });
              return (
                <View key={t.key} style={[styles.routeCard, { width: cardWidth }]}>
                  <View style={styles.chipRow}>
                    <View style={styles.chip}>
                      <Text style={styles.chipText}>
                        {formatTripDate(t.savedAt)}
                      </Text>
                    </View>
                    <View style={styles.chip}>
                      <Text style={styles.chipText}>
                        {t.routeName}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.fromTo} numberOfLines={2}>
                    <Text style={styles.fromToLabel}>From: </Text>
                    {t.originLabel}
                  </Text>
                  <Text style={styles.fromTo} numberOfLines={2}>
                    <Text style={styles.fromToLabel}>To: </Text>
                    {t.destinationLabel}
                  </Text>
                  <View style={styles.etaRow}>
                    <Text style={styles.etaLabel}>Fare: </Text>
                    <Ionicons name="wallet-outline" size={16} color="#212529" />
                    <Text style={styles.etaValue}> {normalized.fareText}</Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [
                      styles.reRouteBtn,
                      pressed && styles.reRouteBtnPressed,
                    ]}
                    onPress={() =>
                      openSearchWithRoute(t.originLabel, t.destinationLabel)
                    }
                  >
                    <Text style={styles.reRouteBtnText}>Re-Route</Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#fff",
  },
  headerShell: {
    backgroundColor: GREEN,
    overflow: "hidden",
  },
  headerSafe: {
    backgroundColor: GREEN,
  },
  headerInner: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 24,
  },
  greeting: {
    fontSize: 30,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
  },
  tagline: {
    fontSize: 16,
    color: "rgba(255,255,255,0.92)",
    marginBottom: 18,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SEARCH_BG,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 13,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  searchRowPressed: {
    opacity: 0.88,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 16,
    color: "#6c757d",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 22,
  },
  mapSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  mapSectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: GREEN_HEADING,
  },
  locationHint: {
    marginTop: 12,
    fontSize: 13,
    color: "#64748b",
    lineHeight: 18,
  },
  recentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 26,
    marginBottom: 14,
  },
  recentTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: GREEN_HEADING,
  },
  seeAll: {
    fontSize: 14,
    fontWeight: "600",
    color: "#40916c",
  },
  recentEmpty: {
    fontSize: 14,
    color: "#868e96",
    lineHeight: 20,
  },
  recentCarousel: {
    gap: 14,
    paddingRight: 22,
  },
  routeCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e9ecef",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    backgroundColor: "#e9ecef",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#495057",
  },
  fromTo: {
    fontSize: 14,
    color: "#212529",
    marginBottom: 6,
  },
  fromToLabel: {
    fontWeight: "600",
    color: GREEN_HEADING,
  },
  etaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 14,
  },
  etaLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: GREEN_HEADING,
  },
  etaValue: {
    fontSize: 14,
    color: "#212529",
  },
  reRouteBtn: {
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  reRouteBtnPressed: {
    opacity: 0.9,
  },
  reRouteBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
