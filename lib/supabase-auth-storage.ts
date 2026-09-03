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

const webLocalStorage =
  Platform.OS === "web" && typeof localStorage !== "undefined"
    ? localStorage
    : null;

async function readAll(): Promise<Record<string, string>> {
  if (webLocalStorage) {
    try {
      const raw = webLocalStorage.getItem(WEB_STORAGE_KEY);
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

  if (webLocalStorage) {
    if (Object.keys(store).length === 0) {
      webLocalStorage.removeItem(WEB_STORAGE_KEY);
    } else {
      webLocalStorage.setItem(WEB_STORAGE_KEY, payload);
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
    if (webLocalStorage) {
      const direct = webLocalStorage.getItem(key);
      if (direct) return direct;

      // Migrate session from older bundled localStorage format.
      try {
        const raw = webLocalStorage.getItem(WEB_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as unknown;
        if (
          parsed &&
          typeof parsed === "object" &&
          !Array.isArray(parsed) &&
          Object.prototype.hasOwnProperty.call(parsed, key)
        ) {
          const value = (parsed as Record<string, string>)[key];
          webLocalStorage.setItem(key, value);
          return value;
        }
      } catch {
        return null;
      }
      return null;
    }
    const all = await readAll();
    return Object.prototype.hasOwnProperty.call(all, key) ? all[key] : null;
  },
  setItem: async (key: string, value: string) => {
    if (webLocalStorage) {
      webLocalStorage.setItem(key, value);
      return;
    }
    const all = await readAll();
    all[key] = value;
    await writeAll(all);
  },
  removeItem: async (key: string) => {
    if (webLocalStorage) {
      webLocalStorage.removeItem(key);
      return;
    }
    const all = await readAll();
    delete all[key];
    await writeAll(all);
  },
};
