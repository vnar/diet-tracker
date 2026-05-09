import "react-native-get-random-values";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import "react-native-reanimated";

import { useColorScheme } from "@/components/useColorScheme";
import { AuthProvider } from "@/src/auth/AuthContext";
import { MobilePostHogRoot } from "@/src/analytics/MobilePostHogRoot";
import { AppOpenedPing } from "@/src/analytics/AppOpenedPing";
import { DashboardProvider } from "@/src/data/DashboardContext";
import { initSentryIfConfigured } from "@/src/telemetry/sentry";

export { ErrorBoundary } from "expo-router";

export const unstable_settings = {
  initialRouteName: "index",
};

SplashScreen.preventAutoHideAsync();

initSentryIfConfigured();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <MobilePostHogRoot>
          <AppOpenedPing />
          <DashboardProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="login" options={{ title: "Sign in" }} />
              <Stack.Screen name="(tabs)" />
            </Stack>
          </DashboardProvider>
        </MobilePostHogRoot>
      </AuthProvider>
    </ThemeProvider>
  );
}
