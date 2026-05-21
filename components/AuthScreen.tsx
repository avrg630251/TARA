import { useHeaderHeight } from "@react-navigation/elements";
import type { ReactNode } from "react";
import { Platform, StyleSheet, useWindowDimensions } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { SafeAreaView } from "react-native-safe-area-context";

const BG = "#f8fafc";

export function AuthScreen({ children }: { children: ReactNode }) {
  const { height: windowHeight } = useWindowDimensions();
  const headerHeight = useHeaderHeight();

  const minContentHeight = windowHeight - headerHeight;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAwareScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scrollContent,
          { minHeight: minContentHeight },
        ]}
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
