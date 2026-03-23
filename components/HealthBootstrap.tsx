"use client";

import { useEffect } from "react";
import { useCognitoAuth } from "@/components/CognitoAuthProvider";
import { sortEntriesByDateAsc } from "@/lib/calculations";
import {
  getEntries,
  getSettings,
  isAwsBackendEnabled,
} from "@/lib/frontend-api-client";
import { setHealthStorageMode, useHealthStore } from "@/lib/store";

export function HealthBootstrap({ children }: { children: React.ReactNode }) {
  const { status, getAccessToken } = useCognitoAuth();

  useEffect(() => {
    if (!isAwsBackendEnabled()) {
      setHealthStorageMode(false);
      return;
    }

    if (status !== "authenticated") {
      setHealthStorageMode(false);
      return;
    }

    const accessToken = getAccessToken();
    if (!accessToken) {
      setHealthStorageMode(false);
      return;
    }

    setHealthStorageMode(true);
    void (async () => {
      const [entriesResult, settingsResult] = await Promise.all([
        getEntries(accessToken),
        getSettings(accessToken),
      ]);
      if (!entriesResult.ok || !settingsResult.ok) return;
      useHealthStore.getState().replaceEntriesAndSettings(
        sortEntriesByDateAsc(entriesResult.data.entries),
        settingsResult.data.settings
      );
    })();
  }, [getAccessToken, status]);

  return <>{children}</>;
}
