import * as Speech from "expo-speech";
import { Platform } from "react-native";

/**
 * Speaks a navigation trip notification using native text-to-speech
 * on iOS and Android via expo-speech, and window.speechSynthesis on web.
 */
export function speakTripNotification(text: string) {
  if (!text || !text.trim()) return;

  try {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.lang = "en-US";
        window.speechSynthesis.speak(utterance);
        return;
      }
    }

    Speech.stop();
    Speech.speak(text, {
      language: "en-US",
      pitch: 1.0,
      rate: 0.95,
    });
  } catch (error) {
    console.warn("Text-to-speech playback failed:", error);
  }
}

/**
 * Stops any ongoing text-to-speech announcement.
 */
export function stopTripSpeech() {
  try {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    }
    Speech.stop();
  } catch {
    /* ignore fallback */
  }
}
