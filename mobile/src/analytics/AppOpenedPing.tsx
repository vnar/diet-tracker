import { useEffect } from "react";
import { trackMobile } from "@/src/analytics/bridge";
import { getAppEnv } from "@/src/config/env";

export function AppOpenedPing() {
  useEffect(() => {
    trackMobile("app_opened", { app_env: getAppEnv() });
  }, []);
  return null;
}
