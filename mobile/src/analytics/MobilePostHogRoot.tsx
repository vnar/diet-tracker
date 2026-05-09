import type { PostHogEventProperties } from "@posthog/core";
import React, { useEffect } from "react";
import Constants from "expo-constants";
import { PostHogProvider, usePostHog } from "posthog-react-native";
import { setAnalyticsCapture } from "@/src/analytics/bridge";
import { getAppEnv } from "@/src/config/env";

function BridgeRegister() {
  const posthog = usePostHog();
  useEffect(() => {
    void posthog.register({
      app_env: getAppEnv(),
      app: "ojas_health_mobile",
    } as PostHogEventProperties);
    setAnalyticsCapture((event, props) => {
      posthog.capture(event, props as PostHogEventProperties | undefined);
    });
    return () => setAnalyticsCapture(null);
  }, [posthog]);
  return null;
}

export function MobilePostHogRoot({ children }: { children: React.ReactNode }) {
  const apiKey =
    (Constants.expoConfig?.extra?.posthogKey as string | undefined)?.trim() ||
    process.env.EXPO_PUBLIC_POSTHOG_KEY?.trim();
  const host =
    (Constants.expoConfig?.extra?.posthogHost as string | undefined)?.trim() ||
    process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() ||
    "https://us.i.posthog.com";

  if (!apiKey) {
    return <>{children}</>;
  }

  return (
    <PostHogProvider
      apiKey={apiKey}
      options={{
        host,
        persistence: "memory",
        captureAppLifecycleEvents: false,
      }}
      autocapture={{
        captureScreens: false,
        captureTouches: false,
      }}
    >
      <BridgeRegister />
      {children}
    </PostHogProvider>
  );
}
