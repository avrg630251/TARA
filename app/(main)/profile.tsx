import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

const GREEN = "#1B4332";

function fullNameFromUser(user: User | undefined) {
  if (!user) return "";
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const full =
    typeof meta?.full_name === "string"
      ? meta.full_name.trim()
      : typeof meta?.name === "string"
        ? (meta.name as string).trim()
        : "";
  return full;
}

export default function ProfileScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const email = session?.user?.email ?? "";

  useEffect(() => {
    if (session?.user) {
      setName(fullNameFromUser(session.user));
    }
  }, [session?.user]);

  const canSave = useMemo(() => {
    const trimmed = name.trim();
    return trimmed.length > 0 && trimmed !== fullNameFromUser(session?.user);
  }, [name, session?.user]);

  async function saveProfile() {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Name required", "Enter a display name to save.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({
      data: { full_name: trimmed },
    });
    setSaving(false);
    if (error) {
      Alert.alert("Could not update", error.message);
      return;
    }
    Alert.alert("Saved", "Your profile was updated.");
  }

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    setSigningOut(false);
    router.replace("/welcome");
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.subtitle}>Sign-in details and display name.</Text>

      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Email</Text>
        <View style={styles.readonlyRow}>
          <Ionicons name="mail-outline" size={18} color="#868e96" />
          <Text style={styles.readonly}>{email || "Not available"}</Text>
        </View>
      </View>

      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Display name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor="#868e96"
          autoCapitalize="words"
        />
      </View>

      <Pressable
        style={[
          styles.saveBtn,
          (!canSave || saving) && styles.saveBtnDisabled,
        ]}
        onPress={() => saveProfile()}
        disabled={!canSave || saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveBtnText}>Save changes</Text>
        )}
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.signOutBtn,
          pressed && styles.signOutPressed,
          signingOut && styles.signOutDisabled,
        ]}
        onPress={signOut}
        disabled={signingOut}
      >
        {signingOut ? (
          <ActivityIndicator color={GREEN} />
        ) : (
          <Text style={styles.signOutText}>Sign out</Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#fff",
    paddingHorizontal: 22,
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
    marginBottom: 24,
  },
  fieldBlock: {
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#495057",
    marginBottom: 8,
  },
  readonlyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e9ecef",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#f8f9fa",
  },
  readonly: {
    fontSize: 15,
    color: "#495057",
    flex: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ced4da",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#212529",
  },
  saveBtn: {
    marginTop: 8,
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveBtnDisabled: {
    opacity: 0.45,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  signOutBtn: {
    marginTop: 28,
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  signOutPressed: { opacity: 0.7 },
  signOutDisabled: { opacity: 0.5 },
  signOutText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#c92a2a",
  },
});
