import AsyncStorage from "@react-native-async-storage/async-storage";

export async function kvGet(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

export async function kvSet(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}
