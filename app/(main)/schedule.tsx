import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  DEFAULT_CLASS_SCHEDULES,
  formatTimeDisplay,
  getNextClassInfo,
  loadClassSchedules,
  parseClassScheduleText,
  saveClassSchedules,
  type ClassScheduleItem,
} from "@/lib/classSchedules";

const GREEN = "#1B4332";

export default function ScheduleScreen() {
  const [items, setItems] = useState<ClassScheduleItem[]>(DEFAULT_CLASS_SCHEDULES);
  const [title, setTitle] = useState("");
  const [day, setDay] = useState("Mon");
  const [time, setTime] = useState("07:30");
  const [location, setLocation] = useState("");
  const [bulkText, setBulkText] = useState("");

  useEffect(() => {
    let cancelled = false;
    void loadClassSchedules().then((saved) => {
      if (!cancelled) setItems(saved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const nextClass = useMemo(() => getNextClassInfo(items), [items]);

  async function saveAndSync(next: ClassScheduleItem[]) {
    setItems(next);
    await saveClassSchedules(next);
  }

  async function addSingleSchedule() {
    if (!title.trim()) {
      Alert.alert("Class name needed", "Enter the class title before adding the schedule.");
      return;
    }

    const nextItem: ClassScheduleItem = {
      id: `${title}-${day}-${time}-${Date.now()}`,
      title: title.trim(),
      day,
      time,
      location: location.trim() || "Campus",
      routeHint: "Best route for this class time.",
    };

    const next = [nextItem, ...items];
    await saveAndSync(next);
    setTitle("");
    setLocation("");
    setTime("07:30");
    setDay("Mon");
  }

  async function importBulkSchedules() {
    if (!bulkText.trim()) {
      Alert.alert("Nothing to import", "Paste or type some class schedules first.");
      return;
    }

    const parsed = parseClassScheduleText(bulkText);
    if (!parsed.length) {
      Alert.alert("Could not parse", "Use lines like: Mon - 7:30 - Math 101 - Main Campus");
      return;
    }

    const next = [...parsed, ...items];
    await saveAndSync(next);
    setBulkText("");
  }

  async function removeSchedule(id: string) {
    const next = items.filter((item) => item.id !== id);
    await saveAndSync(next);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Class Schedule</Text>
          <Ionicons name="calendar" size={24} color={GREEN} />
        </View>

        {nextClass.item ? (
          <View style={styles.highlightCard}>
            <Text style={styles.highlightLabel}>Next class</Text>
            <Text style={styles.highlightTitle}>{nextClass.item.title}</Text>
            <Text style={styles.highlightMeta}>
              {nextClass.item.day} · {formatTimeDisplay(nextClass.item.time)} · {nextClass.item.location}
            </Text>
          </View>
        ) : null}

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Add a class</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Class name"
            style={styles.input}
          />

          <View style={styles.inlineFields}>
            <TextInput
              value={day}
              onChangeText={setDay}
              placeholder="Mon"
              style={[styles.input, styles.halfInput]}
            />
            <TextInput
              value={time}
              onChangeText={setTime}
              placeholder="07:30"
              style={[styles.input, styles.halfInput]}
            />
          </View>

          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="Location or building"
            style={styles.input}
          />

          <Pressable style={styles.primaryButton} onPress={addSingleSchedule}>
            <Text style={styles.primaryButtonText}>Add class</Text>
          </Pressable>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Import schedule</Text>
          <TextInput
            value={bulkText}
            onChangeText={setBulkText}
            placeholder="Mon - 7:30 - Math 101 - Main Campus"
            multiline
            numberOfLines={5}
            style={[styles.input, styles.textArea]}
          />
          <Pressable style={styles.secondaryButton} onPress={importBulkSchedules}>
            <Text style={styles.secondaryButtonText}>Import schedule</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Saved classes</Text>
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {items.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <View>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemMeta}>
                    {item.day} · {formatTimeDisplay(item.time)} · {item.location}
                  </Text>
                </View>
                <Pressable onPress={() => removeSchedule(item.id)}>
                  <Ionicons name="trash-outline" size={18} color="#c92a2a" />
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  container: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: GREEN,
  },
  highlightCard: {
    backgroundColor: "#e9f6ef",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#cfe7d9",
    padding: 14,
    marginBottom: 16,
  },
  highlightLabel: {
    fontSize: 12,
    color: "#2d6a4f",
    fontWeight: "700",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  highlightTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: GREEN,
    marginBottom: 4,
  },
  highlightMeta: {
    fontSize: 13,
    color: "#495057",
  },
  formCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d5e8dc",
    padding: 14,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: GREEN,
    marginBottom: 10,
  },
  input: {
    backgroundColor: "#f5f7f8",
    borderColor: "#dbe2e8",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 10,
    color: "#1f2937",
  },
  inlineFields: {
    flexDirection: "row",
    gap: 10,
  },
  halfInput: {
    flex: 1,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  primaryButton: {
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  secondaryButton: {
    backgroundColor: "#ecf5f0",
    borderColor: "#cfe7d9",
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: GREEN,
    fontWeight: "700",
    fontSize: 15,
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: 10,
    paddingBottom: 30,
  },
  itemCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d5e8dc",
    padding: 12,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: GREEN,
    marginBottom: 4,
  },
  itemMeta: {
    fontSize: 12,
    color: "#495057",
  },
});
