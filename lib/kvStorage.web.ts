/** Web: avoid bundling @react-native-async-storage (Metro/web resolution issues). */

export async function kvGet(key: string): Promise<string | null> {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: string): Promise<void> {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota / private mode */
  }
}
