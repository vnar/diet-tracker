import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import type { CognitoSessionTokens } from "@/src/auth/types";

const SECURE_KEY = "healthos.cognito.session";
/** Fallback when SecureStore throws (common in some Expo Go / Android setups). */
const ASYNC_KEY = "healthos.cognito.session.v1";

function parseSession(raw: string): CognitoSessionTokens | null {
  try {
    const parsed = JSON.parse(raw) as CognitoSessionTokens;
    if (!parsed.accessToken || !parsed.idToken || !parsed.expiresAt) return null;
    if (Date.now() >= parsed.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function readStoredSession(): Promise<CognitoSessionTokens | null> {
  try {
    const raw = await SecureStore.getItemAsync(SECURE_KEY);
    const fromSecure = raw ? parseSession(raw) : null;
    if (fromSecure) return fromSecure;
  } catch {
    /* use async fallback */
  }
  const fallback = await AsyncStorage.getItem(ASYNC_KEY);
  return fallback ? parseSession(fallback) : null;
}

export async function writeStoredSession(session: CognitoSessionTokens): Promise<void> {
  const serialized = JSON.stringify(session);
  try {
    await SecureStore.setItemAsync(SECURE_KEY, serialized);
    await AsyncStorage.removeItem(ASYNC_KEY);
    return;
  } catch {
    /* SecureStore unavailable — still let the user stay signed in */
  }
  await AsyncStorage.setItem(ASYNC_KEY, serialized);
}

export async function clearStoredSession(): Promise<void> {
  await Promise.allSettled([
    SecureStore.deleteItemAsync(SECURE_KEY),
    AsyncStorage.removeItem(ASYNC_KEY),
  ]);
}
