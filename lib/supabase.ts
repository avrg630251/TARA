import "react-native-url-polyfill/auto";
import { processLock } from "@supabase/auth-js";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

import { supabaseAuthStorage } from "@/lib/supabase-auth-storage";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (__DEV__ && (!supabaseUrl || !supabaseAnonKey)) {
  console.warn(
    "[TARA] Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in a .env file (see .env.example)."
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
