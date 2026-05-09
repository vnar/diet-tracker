import Constants from "expo-constants";
import { normalizeAwsApiBaseUrl, trimTrailingSlash } from "@/src/api/urlNormalize";

/** Mirrors web `getAwsApiBaseUrl` / `trimTrailingSlash` in `lib/frontend-api-client.ts`. */

export { normalizeAwsApiBaseUrl, trimTrailingSlash } from "@/src/api/urlNormalize";

export function getAwsApiBaseUrl(): string {
  const fromExtra = (Constants.expoConfig?.extra?.awsApiUrl as string | undefined)?.trim();
  return normalizeAwsApiBaseUrl(fromExtra || process.env.EXPO_PUBLIC_AWS_API_URL);
}
