import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTravel } from "@/contexts/TravelContext";

const GREEN = "#1B4332";

export default function SavedScreen() {
  const router = useRouter();
  const { bookmarks, recentTrips, removeBookmark, removeRecent } =
    useTravel();

  function openSearch(origin: string, destination: string) {
    router.push({
      pathname: "/search",
      params: { origin, destination },
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Saved routes</Text>
        <Text style={styles.subtitle}>
          Bookmarked trips and journeys you have recently started live here.
        </Text>

        <Text style={styles.sectionLabel}>Bookmarks</Text>
        {bookmarks.length === 0 ? (
          <Text style={styles.empty}>
            No bookmarks yet — tap the bookmark on a route in Search to save it.
          </Text>
        ) : (
          bookmarks.map((b) => (
            <View key={b.key} style={styles.row}>
              <View style={styles.rowBody}>
                <Text style={styles.routeName} numberOfLines={1}>
                  {b.routeName}
                </Text>
                <FromTo from={b.originLabel} to={b.destinationLabel} />
                <Text style={styles.meta}>
                  {b.estimatedText} · {b.fareText}
                </Text>
                <Text style={styles.boardOff} numberOfLines={1}>
                  Board: {b.boardStop}
                </Text>
                <Text style={styles.boardOff} numberOfLines={1}>
                  Get off: {b.offStop}
                </Text>
              </View>
              <View style={styles.actions}>
                <Pressable
                  style={styles.iconBtn}
                  onPress={() => openSearch(b.originLabel, b.destinationLabel)}
                  hitSlop={8}
                  accessibilityLabel="Use this bookmark in search"
                >
                  <Ionicons name="navigate-outline" size={22} color={GREEN} />
                </Pressable>
                <Pressable
                  style={styles.iconBtn}
                  onPress={() => removeBookmark(b.key)}
                  hitSlop={8}
                  accessibilityLabel="Remove bookmark"
                >
                  <Ionicons name="trash-outline" size={22} color="#c92a2a" />
                </Pressable>
              </View>
            </View>
          ))
        )}

        <Text style={[styles.sectionLabel, styles.sectionSp]}>Recent</Text>
        {recentTrips.length === 0 ? (
          <Text style={styles.empty}>
            Recent trips appear after you tap Start trip on a route option.
          </Text>
        ) : (
          recentTrips.map((t) => (
            <View key={t.key} style={styles.row}>
              <View style={styles.rowBody}>
                <FromTo from={t.originLabel} to={t.destinationLabel} />
                <View style={styles.etaWrap}>
                  <Text style={styles.meta}>ETA:</Text>
                  <Ionicons name="time-outline" size={16} color="#495057" />
                  <Text style={styles.meta}>
                    {" "}
                    {t.etaText} · {t.routeName}
                  </Text>
                </View>
                <Text style={styles.micro} numberOfLines={1}>
                  Board: {t.boardStop}
                </Text>
                <Text style={styles.micro} numberOfLines={1}>
                  Get off: {t.offStop}
                </Text>
              </View>
              <View style={styles.actions}>
                <Pressable
                  style={styles.iconBtn}
                  onPress={() =>
                    openSearch(t.originLabel, t.destinationLabel)
                  }
                  hitSlop={8}
                  accessibilityLabel="Re-route"
                >
                  <Ionicons name="refresh-outline" size={22} color={GREEN} />
                </Pressable>
                <Pressable
                  style={styles.iconBtn}
                  onPress={() => removeRecent(t.key)}
                  hitSlop={8}
                  accessibilityLabel="Remove from history"
                >
                  <Ionicons name="trash-outline" size={22} color="#868e96" />
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function FromTo({ from, to }: { from: string; to: string }) {
  return (
    <>
      <Text style={styles.fromTo} numberOfLines={2}>
        <Text style={styles.fromToLabel}>From: </Text>
        {from}
      </Text>
      <Text style={styles.fromTo} numberOfLines={2}>
        <Text style={styles.fromToLabel}>To: </Text>
        {to}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 22,
    paddingBottom: 32,
    paddingTop: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: GREEN,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    marginBottom: 22,
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: GREEN,
    marginBottom: 12,
  },
  sectionSp: {
    marginTop: 26,
  },
  empty: {
    fontSize: 14,
    color: "#868e96",
    lineHeight: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e9ecef",
    gap: 10,
  },
  rowBody: { flex: 1, minWidth: 0 },
  routeName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#212529",
    marginBottom: 6,
  },
  fromTo: {
    fontSize: 14,
    color: "#212529",
    marginBottom: 4,
  },
  fromToLabel: {
    color: GREEN,
    fontWeight: "600",
  },
  etaWrap: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 4,
    gap: 4,
  },
  meta: {
    fontSize: 13,
    color: "#495057",
  },
  micro: {
    fontSize: 12,
    color: "#868e96",
    marginTop: 2,
  },
  boardOff: {
    fontSize: 12,
    color: "#495057",
    marginTop: 2,
  },
  actions: {
    flexDirection: "column",
    gap: 4,
    paddingTop: 2,
  },
  iconBtn: {
    padding: 6,
  },
});
