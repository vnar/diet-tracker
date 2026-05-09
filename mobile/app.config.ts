import { config as loadDotenv } from "dotenv";
import path from "node:path";
import type { ExpoConfig } from "expo/config";

// Load mobile/.env before reading process.env (monorepo / varying cwd).
loadDotenv({ path: path.resolve(__dirname, ".env") });

/**
 * Ojas-Health native shell — env at build time via EXPO_PUBLIC_* (EAS `env` / local .env).
 * Never commit secrets; use EAS Secrets for production/staging.
 */
const appEnv = (process.env.EXPO_PUBLIC_APP_ENV ?? "development") as
  | "development"
  | "staging"
  | "production";

export default (): ExpoConfig => ({
  name: "Ojas Health",
  slug: "ojas-health",
  version: "1.0.0",
  orientation: "portrait",
  scheme: "ojashealth",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  icon: "./assets/images/icon.png",
  splash: {
    image: "./assets/images/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#0f172a",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "health.ojas.mobile",
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#0f172a",
    },
    package: "health.ojas.mobile",
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-image-picker",
      {
        photosPermission: "Allow Ojas Health to add a progress photo to your daily log.",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    appEnv,
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? "",
    posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? "",
    posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    /** Baked at `expo start` / EAS build so runtime always matches `.env` (not only Metro inlining). */
    useAwsBackend: process.env.EXPO_PUBLIC_USE_AWS_BACKEND ?? "false",
    awsApiUrl: process.env.EXPO_PUBLIC_AWS_API_URL ?? "",
    cognitoRegion:
      process.env.EXPO_PUBLIC_COGNITO_REGION ?? process.env.EXPO_PUBLIC_AWS_REGION ?? "",
    cognitoUserPoolId: process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID ?? "",
    cognitoUserPoolClientId: process.env.EXPO_PUBLIC_COGNITO_USER_POOL_CLIENT_ID ?? "",
  },
});
