import Constants from "expo-constants";
import * as Sentry from "@sentry/react-native";

let initialized = false;

export function initSentryIfConfigured(): void {
  if (initialized) return;
  const dsn =
    (Constants.expoConfig?.extra?.sentryDsn as string | undefined)?.trim() ||
    process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) return;
  Sentry.init({
    dsn,
    enabled: true,
    tracesSampleRate: 0.2,
    environment: (Constants.expoConfig?.extra?.appEnv as string) ?? process.env.EXPO_PUBLIC_APP_ENV ?? "development",
  });
  initialized = true;
}

export function captureMobileException(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
