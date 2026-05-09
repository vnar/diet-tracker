import Constants from "expo-constants";
import { getAwsApiBaseUrl } from "@/src/api/url";

export type AppEnv = "development" | "staging" | "production";

export function getAppEnv(): AppEnv {
  const raw = Constants.expoConfig?.extra?.appEnv ?? process.env.EXPO_PUBLIC_APP_ENV ?? "development";
  if (raw === "staging" || raw === "production") return raw;
  return "development";
}

export function getCognitoConfig(): {
  region: string;
  userPoolId: string;
  userPoolClientId: string;
} | null {
  const region =
    (Constants.expoConfig?.extra?.cognitoRegion as string | undefined)?.trim() ||
    process.env.EXPO_PUBLIC_COGNITO_REGION?.trim() ||
    process.env.EXPO_PUBLIC_AWS_REGION?.trim();
  const userPoolId =
    (Constants.expoConfig?.extra?.cognitoUserPoolId as string | undefined)?.trim() ||
    process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID?.trim();
  const userPoolClientId =
    (Constants.expoConfig?.extra?.cognitoUserPoolClientId as string | undefined)?.trim() ||
    process.env.EXPO_PUBLIC_COGNITO_USER_POOL_CLIENT_ID?.trim();

  if (!region || !userPoolId || !userPoolClientId) return null;
  return { region, userPoolId, userPoolClientId };
}

export function parseBoolEnv(value: string | undefined): boolean {
  return value === "true";
}

export function isAwsBackendEnabled(): boolean {
  const extraFlag = Constants.expoConfig?.extra?.useAwsBackend as string | undefined;
  const enabled =
    parseBoolEnv(extraFlag?.trim()) || parseBoolEnv(process.env.EXPO_PUBLIC_USE_AWS_BACKEND);
  const base = getAwsApiBaseUrl();
  return enabled && base.length > 0;
}
