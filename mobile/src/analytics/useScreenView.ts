import { useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { trackMobile } from "@/src/analytics/bridge";

export function useScreenView(screen: string): void {
  useFocusEffect(
    useCallback(() => {
      trackMobile("mobile_screen_viewed", { screen });
    }, [screen]),
  );
}
