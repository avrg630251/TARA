import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useTravel } from "@/contexts/TravelContext";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

const GREEN = "#1C5141";
const DEFAULT_SCHOOL = "De La Salle Araneta University";

function fullNameFromUser(user: User | undefined) {
  if (!user) return "";
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const full =
    typeof meta?.full_name === "string"
      ? meta.full_name.trim()
      : typeof meta?.name === "string"
        ? meta.name.trim()
        : "";
  return full;
}

function avatarFromUser(user: User | undefined) {
  const avatar = user?.user_metadata?.avatar_url;
  return typeof avatar === "string" ? avatar : "";
}

function schoolFromUser(user: User | undefined) {
  const school = user?.user_metadata?.school_name;
  return typeof school === "string" && school.trim()
    ? school.trim()
    : DEFAULT_SCHOOL;
}

export default function ProfileScreen() {
  const { session } = useAuth();
  const { bookmarks, recentTrips } = useTravel();
  const router = useRouter();
  const user = session?.user;
  const [name, setName] = useState("");
  const [school, setSchool] = useState(DEFAULT_SCHOOL);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [discountVisible, setDiscountVisible] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [discountType, setDiscountType] = useState<"regular" | "discounted">(
    user?.user_metadata?.discount_type === "discounted" ? "discounted" : "regular"
  );

  useEffect(() => {
    if (user) {
      // Auth state is the source of truth after the session finishes loading.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(fullNameFromUser(user));
      setSchool(schoolFromUser(user));
      setAvatarUrl(avatarFromUser(user));
      setDiscountType(
        user.user_metadata?.discount_type === "discounted" ? "discounted" : "regular"
      );
    }
  }, [user]);

  const displayName = name.trim() || "Your Name";
  const canSave = useMemo(
    () =>
      name.trim().length > 0 &&
      (name.trim() !== fullNameFromUser(user) ||
        school.trim() !== schoolFromUser(user) ||
        avatarUrl !== avatarFromUser(user)),
    [avatarUrl, name, school, user]
  );
  const totalFare = useMemo(
    () =>
      recentTrips.reduce((total, trip) => {
        if (typeof trip.fareValue === "number" && Number.isFinite(trip.fareValue)) {
          return total + trip.fareValue;
        }
        const match = trip.fareText?.match(/(?:₱|PHP|Php)\s*([0-9]+(?:\.[0-9]+)?)/i);
        return total + (match ? Number(match[1]) : 0);
      }, 0),
    [recentTrips]
  );

  async function chooseProfilePicture() {
    setPickingImage(true);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPickingImage(false);
      Alert.alert(
        "Permission needed",
        "Allow photo library access to choose a profile picture."
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    setPickingImage(false);
    if (!result.canceled) {
      setAvatarUrl(result.assets[0].uri);
    }
  }

  async function saveProfile() {
    const trimmed = name.trim();
    const trimmedSchool = school.trim();
    if (!trimmed) {
      Alert.alert("Name required", "Enter a display name to save.");
      return;
    }
    if (!trimmedSchool) {
      Alert.alert("School required", "Enter your school to save.");
      return;
    }
    setSaving(true);
    let savedAvatarUrl = avatarUrl;
    if (avatarUrl && avatarUrl !== avatarFromUser(user)) {
      const response = await fetch(avatarUrl);
      const blob = await response.blob();
      const path = `${user?.id}/avatar`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: blob.type || "image/jpeg" });
      if (uploadError) {
        setSaving(false);
        Alert.alert(
          "Could not upload picture",
          `${uploadError.message} Create the public "avatars" storage bucket in Supabase first.`
        );
        return;
      }
      savedAvatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    }
    const { error } = await supabase.auth.updateUser({
      data: {
        full_name: trimmed,
        school_name: trimmedSchool,
        avatar_url: savedAvatarUrl || null,
      },
    });
    setSaving(false);
    if (error) {
      Alert.alert("Could not update", error.message);
      return;
    }
    Alert.alert("Saved", "Your profile was updated.");
    setEditVisible(false);
  }

  async function saveDiscountType(value: "regular" | "discounted") {
    setDiscountType(value);
    setDiscountVisible(false);
    const { error } = await supabase.auth.updateUser({
      data: { discount_type: value },
    });
    if (error) Alert.alert("Could not save discount type", error.message);
  }

  async function changePassword() {
    if (!user) {
      Alert.alert("Not signed in", "Please sign in again before changing your password.");
      return;
    }

    if (newPassword.length < 8) {
      Alert.alert("Password too short", "Your new password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Passwords do not match", "Enter the same password in both fields.");
      return;
    }

    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) {
      Alert.alert("Could not change password", error.message);
      return;
    }
    setNewPassword("");
    setConfirmPassword("");
    setPasswordVisible(false);
    Alert.alert("Password updated", "Your password was changed successfully.");
  }

  function openSupport() {
    void Linking.openURL(
      "mailto:tara.testing.app@gmail.com?subject=TARA%20Help%20Request"
    ).catch(() =>
      Alert.alert("Unable to open email", "Please contact tara.testing.app@gmail.com.")
    );
  }

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    setSigningOut(false);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Pressable
            style={styles.avatarButton}
            onPress={chooseProfilePicture}
            accessibilityRole="button"
            accessibilityLabel="Change profile picture"
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person-outline" size={38} color="#fff" />
            )}
            <View style={styles.cameraBadge}>
              {pickingImage ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="camera" size={15} color="#fff" />
              )}
            </View>
          </Pressable>
          <Text style={styles.heroName}>{displayName}</Text>
          <Text style={styles.heroSchool}>{school}</Text>
        </View>

        <View style={styles.statsCard}>
          <Stat value={recentTrips.length} label="Trips taken" />
          <Stat value={bookmarks.length} label="Saved routes" />
          <Stat value={`₱${totalFare.toFixed(2)}`} label="Total fare" />
        </View>

        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.menuCard}>
          <MenuRow icon="person-outline" label="Edit Profile" onPress={() => setEditVisible(true)} />
          <MenuRow
            icon="card-outline"
            label={`Discount Type · ${discountType === "discounted" ? "Discounted" : "Regular"}`}
            onPress={() => setDiscountVisible(true)}
          />
          <MenuRow
            icon="lock-closed-outline"
            label="Change Password"
            onPress={() => setPasswordVisible(true)}
          />
          <MenuRow icon="calendar-outline" label="Schedule" onPress={() => router.push("/schedule")} />
        </View>

        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.menuCard}>
          <MenuRow icon="help-circle-outline" label="Help & Support" onPress={openSupport} />
        </View>

        <Pressable style={styles.logoutButton} onPress={signOut} disabled={signingOut}>
          {signingOut ? <ActivityIndicator color="#fff" /> : <><Ionicons name="log-out-outline" size={15} color="#fff" /><Text style={styles.logoutText}>Log Out</Text></>}
        </Pressable>
      </ScrollView>

      <Modal visible={editVisible} transparent animationType="slide" onRequestClose={() => setEditVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <Pressable onPress={() => setEditVisible(false)}><Ionicons name="close" size={22} color={GREEN} /></Pressable>
            </View>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor="#8b9a94"
              autoCapitalize="words"
            />
            <Text style={styles.modalFieldLabel}>School</Text>
            <TextInput
              style={styles.input}
              value={school}
              onChangeText={setSchool}
              placeholder={DEFAULT_SCHOOL}
              placeholderTextColor="#8b9a94"
              autoCapitalize="words"
            />
            <Text style={styles.email}>{user?.email || "Not available"}</Text>
            <Pressable style={[styles.saveButton, (!canSave || saving) && styles.disabled]} onPress={saveProfile} disabled={!canSave || saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save changes</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={discountVisible} transparent animationType="fade" onRequestClose={() => setDiscountVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Discount Type</Text>
            {(["regular", "discounted"] as const).map((value) => (
              <Pressable key={value} style={styles.optionRow} onPress={() => saveDiscountType(value)}>
                <Ionicons
                  name={discountType === value ? "radio-button-on" : "radio-button-off"}
                  size={21}
                  color={GREEN}
                />
                <Text style={styles.optionText}>
                  {value === "discounted" ? "Discounted (20%)" : "Regular fare"}
                </Text>
              </Pressable>
            ))}
            <Pressable style={styles.cancelButton} onPress={() => setDiscountVisible(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={passwordVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPasswordVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Password</Text>
              <Pressable onPress={() => setPasswordVisible(false)}>
                <Ionicons name="close" size={22} color={GREEN} />
              </Pressable>
            </View>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="New password"
              placeholderTextColor="#8b9a94"
              secureTextEntry
              autoCapitalize="none"
            />
            <TextInput
              style={[styles.input, styles.passwordConfirmInput]}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm new password"
              placeholderTextColor="#8b9a94"
              secureTextEntry
              autoCapitalize="none"
            />
            <Text style={styles.passwordHint}>Use at least 8 characters.</Text>
            <Pressable
              style={[
                styles.saveButton,
                (changingPassword || !newPassword || !confirmPassword) && styles.disabled,
              ]}
              onPress={changePassword}
              disabled={changingPassword || !newPassword || !confirmPassword}
            >
              {changingPassword ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveText}>Update password</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MenuRow({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.menuRow} onPress={onPress}>
      <View style={styles.menuIcon}><Ionicons name={icon} size={18} color={GREEN} /></View>
      <Text style={styles.menuText}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color="#9aa8a2" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7f8f7" },
  content: { paddingBottom: 32 },
  hero: {
    backgroundColor: GREEN, borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
    alignItems: "center", paddingTop: 28, paddingBottom: 24,
  },
  avatarButton: {
    width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: "#fff",
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  avatarImage: { width: "100%", height: "100%", borderRadius: 48 },
  cameraBadge: {
    position: "absolute", right: -2, bottom: -2, width: 30, height: 30,
    borderRadius: 15, backgroundColor: "#2b8065", alignItems: "center", justifyContent: "center",
  },
  heroName: { color: "#fff", fontSize: 18, fontWeight: "700" },
  heroSchool: { color: "#d9ebe4", fontSize: 12, marginTop: 4 },
  statsCard: {
    flexDirection: "row", backgroundColor: "#fff", marginHorizontal: 16, marginTop: 16,
    borderRadius: 14, paddingVertical: 15, elevation: 2, shadowColor: "#000",
    shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 2 },
  },
  stat: { flex: 1, alignItems: "center", borderRightWidth: 1, borderRightColor: "#e7ebe9" },
  statValue: { color: "#17221e", fontSize: 16, fontWeight: "700" },
  statLabel: { color: "#68756f", fontSize: 11, marginTop: 3 },
  sectionLabel: { color: "#78847f", fontSize: 12, marginTop: 18, marginBottom: 6, marginLeft: 16 },
  menuCard: { backgroundColor: "#fff", marginHorizontal: 16, borderRadius: 14, overflow: "hidden", elevation: 1 },
  menuRow: { minHeight: 52, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "#e5e9e7" },
  menuIcon: { width: 32, alignItems: "flex-start" },
  menuText: { flex: 1, color: "#26312c", fontSize: 14 },
  input: { borderWidth: 1, borderColor: "#d4ded9", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11, color: "#17221e", fontSize: 16 },
  modalFieldLabel: { color: "#68756f", fontSize: 13, fontWeight: "600", marginTop: 14, marginBottom: 6 },
  passwordConfirmInput: { marginTop: 12 },
  email: { color: "#77837e", fontSize: 12, marginTop: 8 },
  passwordHint: { color: "#77837e", fontSize: 12, marginTop: 8 },
  saveButton: { backgroundColor: GREEN, borderRadius: 8, alignItems: "center", paddingVertical: 12, marginTop: 12 },
  disabled: { opacity: 0.45 },
  saveText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  logoutButton: { marginHorizontal: 16, marginTop: 24, backgroundColor: GREEN, borderRadius: 8, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  logoutText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18, paddingBottom: 28 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  modalTitle: { color: GREEN, fontSize: 18, fontWeight: "700", marginBottom: 14 },
  optionRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 10 },
  optionText: { color: "#26312c", fontSize: 16 },
  cancelButton: { alignItems: "center", paddingVertical: 12, marginTop: 6 },
  cancelText: { color: "#68756f", fontSize: 15, fontWeight: "600" },
});
