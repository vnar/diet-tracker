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
      const localEntriesBeforeCloud = useHealthStore.getState().entries;
      const [entriesResult, settingsResult] = await Promise.all([
        getEntries(accessToken),
        getSettings(accessToken),
      ]);

      if (entriesResult.ok) {
        const remoteEntries = sortEntriesByDateAsc(entriesResult.data.entries);
        // Protect against accidental empty-cloud wipes on transient auth/network edge cases.
        if (!(remoteEntries.length === 0 && localEntriesBeforeCloud.length > 0)) {
          useHealthStore.setState({
            entries: remoteEntries,
          });
        }
      } else {
        // One quick retry helps with transient network/preflight blips.
        const retry = await getEntries(accessToken);
        if (retry.ok) {
          const remoteEntries = sortEntriesByDateAsc(retry.data.entries);
          if (!(remoteEntries.length === 0 && localEntriesBeforeCloud.length > 0)) {
            useHealthStore.setState({
              entries: remoteEntries,
            });
          }
        }
      }

      if (settingsResult.ok) {
        useHealthStore.setState({
          settings: settingsResult.data.settings,
        });
      } else {
        const retry = await getSettings(accessToken);
        if (retry.ok) {
          useHealthStore.setState({
            settings: retry.data.settings,
          });
        }
      }
    })();
  }, [getAccessToken, status]);

  return <>{children}</>;
}
