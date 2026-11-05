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

function resolveRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url ?? "";
}

function normalizeHeaders(
  headersInit: HeadersInit | undefined,
  stripContentType: boolean,
  forceCloseConnection: boolean
): Record<string, string> {
  const out: Record<string, string> = {};
  if (headersInit instanceof Headers) {
    headersInit.forEach((value, key) => {
      out[key] = value;
    });
  } else if (Array.isArray(headersInit)) {
    for (const [key, value] of headersInit) {
      out[key] = value;
    }
  } else if (headersInit && typeof headersInit === "object") {
    Object.assign(out, headersInit);
  }

  if (stripContentType) {
    delete out["Content-Type"];
    delete out["content-type"];
  }
  if (forceCloseConnection && Platform.OS !== "web") {
    out["Connection"] = "close";
  }
  return out;
}

function isTransientNetworkError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err ?? "");
  return (
    msg.includes("SocketException") ||
    msg.includes("Connection reset") ||
    msg.includes("Network request failed") ||
    msg.includes("fetch failed") ||
    msg.includes("StreamResetException") ||
    msg.includes("Broken pipe") ||
    msg.includes("EOFException") ||
    msg.includes("Software caused connection abort")
  );
}

const customFetch: typeof fetch = async (input, init) => {
  const url = resolveRequestUrl(input);
  const isLogoutEndpoint = url.includes("/auth/v1/logout");
  const hasNoBody = init?.body === undefined || init?.body === null;
  const retryDelaysMs = [250, 650];

  let lastError: unknown;
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
    const requestInit: RequestInit | undefined = init
      ? {
          ...init,
          headers: normalizeHeaders(
            init.headers,
            hasNoBody,
            attempt > 0 || isLogoutEndpoint
          ),
        }
      : undefined;

    try {
      return await fetch(input, requestInit);
    } catch (err: unknown) {
      lastError = err;
      if (attempt < retryDelaysMs.length && isTransientNetworkError(err)) {
        await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[attempt]));
        continue;
      }
      break;
    }
  }

  // Never let a dropped/reset logout request crash or block local sign-out
  if (isLogoutEndpoint) {
    return new Response(null, { status: 204 });
  }

  throw lastError;
};

export async function revokeSessionOnServerBestEffort(
  accessToken: string | undefined
): Promise<void> {
  if (!accessToken || !supabaseUrl || !supabaseAnonKey || supabaseUrl.includes("placeholder")) {
    return;
  }
  try {
    await fetch(`${supabaseUrl}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        ...(Platform.OS !== "web" ? { Connection: "close" } : {}),
      },
    });
  } catch {
    // Best-effort revocation; local session is already cleared
  }
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
      // Serialize concurrent getSession / onAuthStateChange / signOut operations across all platforms
      lock: processLock,
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
