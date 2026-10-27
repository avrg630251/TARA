import "react-native-url-polyfill/auto";
import { processLock } from "@supabase/auth-js";
import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

import { supabaseAuthStorage } from "@/lib/supabase-auth-storage";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes("placeholder")) {
  console.warn(
    "[TARA] EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY is missing or placeholder. Ensure .env is present before building!"
  );
}

const customFetch: typeof fetch = async (input, init) => {
  let attempts = 0;
  const maxAttempts = 3;
  while (attempts < maxAttempts) {
    attempts++;
    try {
      return await fetch(input, init);
    } catch (err: unknown) {
      const msg = String(
        (err as { message?: string })?.message ?? err ?? ""
      );
      const isTransient =
        msg.includes("SocketException") ||
        msg.includes("Connection reset") ||
        msg.includes("Network request failed") ||
        msg.includes("fetch failed") ||
        msg.includes("CodedError") ||
        msg.includes("Software caused connection abort");

      if (isTransient && attempts < maxAttempts) {
        console.warn(
          `[TARA] Network drop (${msg}), retrying request (${attempts}/${maxAttempts})...`
        );
        await new Promise((resolve) => setTimeout(resolve, 350 * attempts));
        continue;
      }
      throw err;
    }
  }
  return fetch(input, init);
};

export const supabase = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseAnonKey ?? "placeholder-anon-key",
  {
    auth: {
      storage: supabaseAuthStorage,
      flowType: "pkce",
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // Web Locks API (default) races when getSession + onAuthStateChange run together.
      lock: Platform.OS === "web" ? processLock : undefined,
    },
    global: {
      fetch: customFetch,
    },
  }
);

if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
