import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

type AuthBackButtonProps = {
  label?: string;
};

export function AuthBackButton({ label = "Back" }: AuthBackButtonProps) {
  const router = useRouter();

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={24} color="#1B4332" />
        <Text style={styles.label}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 8,
    marginLeft: -4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingRight: 12,
  },
  pressed: {
    opacity: 0.65,
  },
  label: {
    fontSize: 17,
    fontWeight: "500",
    color: "#1B4332",
    marginLeft: -2,
  },
});
