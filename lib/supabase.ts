import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";

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
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
