import {
  deleteAsync,
  documentDirectory,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from "expo-file-system/legacy";
import { Platform } from "react-native";

const WEB_STORAGE_KEY = "tara.supabase.auth.v1";
const STORE_FILENAME = "supabase-auth-store.json";

function storeFileUri(): string | null {
  const base = documentDirectory;
  return base ? `${base}${STORE_FILENAME}` : null;
}

async function readAll(): Promise<Record<string, string>> {
  if (Platform.OS === "web") {
    if (typeof localStorage === "undefined") return {};
    try {
      const raw = localStorage.getItem(WEB_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, string>)
        : {};
    } catch {
      return {};
    }
  }

  const uri = storeFileUri();
  if (!uri) return {};

  try {
    const info = await getInfoAsync(uri);
    if (!info.exists) return {};
    const raw = await readAsStringAsync(uri);
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

async function writeAll(store: Record<string, string>): Promise<void> {
  const payload = JSON.stringify(store);

  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") {
      if (Object.keys(store).length === 0) {
        localStorage.removeItem(WEB_STORAGE_KEY);
      } else {
        localStorage.setItem(WEB_STORAGE_KEY, payload);
      }
    }
    return;
  }

  const uri = storeFileUri();
  if (!uri) return;

  if (Object.keys(store).length === 0) {
    const info = await getInfoAsync(uri);
    if (info.exists) {
      await deleteAsync(uri, { idempotent: true });
    }
    return;
  }

  await writeAsStringAsync(uri, payload);
}

/**
 * Supabase Auth storage that avoids @react-native-async-storage/async-storage.
 * AsyncStorage's native module is often null on Android (Expo Go + New Architecture, etc.).
 * expo-file-system is bundled with Expo and works reliably on device.
 */
export const supabaseAuthStorage = {
  getItem: async (key: string) => {
    const all = await readAll();
    return Object.prototype.hasOwnProperty.call(all, key) ? all[key] : null;
  },
  setItem: async (key: string, value: string) => {
    const all = await readAll();
    all[key] = value;
    await writeAll(all);
  },
  removeItem: async (key: string) => {
    const all = await readAll();
    delete all[key];
    await writeAll(all);
  },
};
