import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";

type PasswordFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
} & Pick<TextInputProps, "autoComplete" | "textContentType">;

export function PasswordField({
  value,
  onChangeText,
  placeholder,
  autoComplete,
  textContentType,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrap}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoComplete={autoComplete}
        textContentType={textContentType}
      />
      <Pressable
        style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
        onPress={() => setVisible((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={visible ? "Hide password" : "Show password"}
        hitSlop={8}
      >
        <Ionicons
          name={visible ? "eye-off-outline" : "eye-outline"}
          size={22}
          color="#64748b"
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: "#fff",
    marginBottom: 16,
  },
  input: {
    flex: 1,
    paddingLeft: 14,
    paddingVertical: 12,
    paddingRight: 8,
    fontSize: 16,
    color: "#0f172a",
  },
  toggle: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  togglePressed: {
    opacity: 0.65,
  },
});
