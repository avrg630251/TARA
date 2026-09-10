import type { ReactNode } from "react";
import { Platform, StyleSheet } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { SafeAreaView } from "react-native-safe-area-context";

const BG = "#1C5141";

export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAwareScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        enableOnAndroid
        enableAutomaticScroll
        extraScrollHeight={Platform.OS === "android" ? 120 : 48}
        extraHeight={Platform.OS === "android" ? 100 : 75}
        keyboardOpeningTime={Platform.OS === "android" ? 0 : 250}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {children}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
    justifyContent: "center",
  },
});
