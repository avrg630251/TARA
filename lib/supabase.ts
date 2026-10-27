import "react-native-url-polyfill/auto";
import { processLock } from "@supabase/auth-js";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

import { supabaseAuthStorage } from "@/lib/supabase-auth-storage";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes("placeholder")) {
  console.warn(
    "[TARA] EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY is missing or placeholder. Ensure .env is present before building!"
  );
}

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
  }
);
