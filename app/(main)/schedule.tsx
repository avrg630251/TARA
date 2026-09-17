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

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  formatTimeDisplay,
  getNextClassInfo,
  loadClassSchedules,
  normalizeScheduleTime,
  saveClassSchedules,
  type ClassScheduleItem,
} from "@/lib/classSchedules";

const GREEN = "#1B4332";

export default function ScheduleScreen() {
  const [items, setItems] = useState<ClassScheduleItem[]>([]);
  const [subjectCode, setSubjectCode] = useState("");
  const [subject, setSubject] = useState("");
  const [days, setDays] = useState<string[]>(["Mon"]);
  const [time, setTime] = useState("");
  const [meridiem, setMeridiem] = useState<"AM" | "PM">("AM");
  const { session } = useAuth();

  useEffect(() => {
    let cancelled = false;
    void loadClassSchedules(session?.user.user_metadata?.class_schedules).then((saved) => {
      if (!cancelled) setItems(saved);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user.user_metadata?.class_schedules]);

  const nextClass = useMemo(() => getNextClassInfo(items), [items]);

  async function saveAndSync(next: ClassScheduleItem[]) {
    setItems(next);
    await saveClassSchedules(next);
    const { error } = await supabase.auth.updateUser({
      data: { class_schedules: next },
    });
    if (error) {
      Alert.alert("Could not save schedule", error.message);
    }
  }

  async function addSingleSchedule() {
    if (!subjectCode.trim() || !subject.trim()) {
      Alert.alert("Subject details needed", "Enter both the subject code and subject.");
      return;
    }
    if (!days.length) {
      Alert.alert("Days needed", "Select at least one class day.");
      return;
    }
    const normalizedTime = normalizeScheduleTime(time, meridiem);
    if (!normalizedTime) {
      Alert.alert("Valid time needed", "Enter a time such as 7:30 and choose AM or PM.");
      return;
    }

    const nextItem: ClassScheduleItem = {
      id: `${subjectCode}-${subject}-${Date.now()}`,
      subjectCode: subjectCode.trim(),
      subject: subject.trim(),
      days,
      time: normalizedTime,
      routeHint: "Best route for this class time.",
    };

    const next = [nextItem, ...items];
    await saveAndSync(next);
    setSubjectCode("");
    setSubject("");
    setTime("");
    setMeridiem("AM");
    setDays(["Mon"]);
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
            <Text style={styles.highlightTitle}>
              {nextClass.item.subjectCode} · {nextClass.item.subject}
            </Text>
            <Text style={styles.highlightMeta}>
              {nextClass.item.days.join(", ")} · {formatTimeDisplay(nextClass.item.time)}
            </Text>
          </View>
        ) : null}

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Add a class</Text>
          <TextInput
            value={subjectCode}
            onChangeText={setSubjectCode}
            placeholder="Subject Code"
            style={styles.input}
            autoCapitalize="characters"
          />
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="Subject"
            style={styles.input}
          />
          <Text style={styles.fieldLabel}>Days</Text>
          <View style={styles.daysRow}>
            {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day) => {
              const selected = days.includes(day);
              return (
                <Pressable
                  key={day}
                  onPress={() =>
                    setDays((current) =>
                      selected
                        ? current.filter((item) => item !== day)
                        : [...current, day]
                    )
                  }
                  style={[styles.dayChip, selected && styles.dayChipActive]}
                >
                  <Text style={[styles.dayChipText, selected && styles.dayChipTextActive]}>
                    {day}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={time}
            onChangeText={setTime}
            placeholder="Time (e.g. 7:30)"
            style={styles.input}
            keyboardType="numbers-and-punctuation"
          />
          <View style={styles.meridiemRow}>
            {(["AM", "PM"] as const).map((option) => (
              <Pressable
                key={option}
                onPress={() => setMeridiem(option)}
                style={[styles.meridiemChip, meridiem === option && styles.dayChipActive]}
              >
                <Text style={[styles.dayChipText, meridiem === option && styles.dayChipTextActive]}>
                  {option}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={styles.primaryButton} onPress={addSingleSchedule}>
            <Text style={styles.primaryButtonText}>Add class</Text>
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
                  <Text style={styles.itemTitle}>
                    {item.subjectCode ? `${item.subjectCode} · ` : ""}{item.subject}
                  </Text>
                  <Text style={styles.itemMeta}>
                    {item.days.join(", ")} · {formatTimeDisplay(item.time)}
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
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#495057",
    marginBottom: 8,
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
  daysRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  meridiemRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: -4,
    marginBottom: 10,
  },
  meridiemChip: {
    minWidth: 58,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cfe7d9",
    backgroundColor: "#f5f7f8",
    paddingVertical: 8,
  },
  dayChip: {
    width: 52,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#cfe7d9",
    backgroundColor: "#f5f7f8",
  },
  dayChipActive: {
    backgroundColor: GREEN,
  },
  dayChipText: {
    color: GREEN,
    fontWeight: "700",
  },
  dayChipTextActive: {
    color: "#fff",
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
