"use client";

import { useEffect } from "react";
import { useCognitoAuth } from "@/components/CognitoAuthProvider";
import { sortEntriesByDateAsc } from "@/lib/calculations";
import {
  getFeatureFlagOverrides,
  getEntries,
  getSettings,
  isAwsBackendEnabled,
} from "@/lib/frontend-api-client";
import { clearUserFlagOverrides, setUserFlagOverrides } from "@/lib/featureFlags";

/** NEXT_PUBLIC_* wins over `/feature-flags` so local `.env.local` can turn on gated UI without redeploying Lambda. */
function mergeNextPublicFeatureFlags(
  overrides: Record<string, boolean>,
): Record<string, boolean> {
  const out = { ...overrides };
  const meal = process.env.NEXT_PUBLIC_FF_MEAL_LIBRARY;
  if (meal === "true") out.FF_MEAL_LIBRARY = true;
  if (meal === "false") out.FF_MEAL_LIBRARY = false;
  const photo = process.env.NEXT_PUBLIC_FF_PHOTO_FOOD_LOG;
  if (photo === "true") out.FF_PHOTO_FOOD_LOG = true;
  if (photo === "false") out.FF_PHOTO_FOOD_LOG = false;
  const nl = process.env.NEXT_PUBLIC_FF_NL_MEAL_PARSE;
  if (nl === "true") out.FF_NL_MEAL_PARSE = true;
  if (nl === "false") out.FF_NL_MEAL_PARSE = false;
  const bill = process.env.NEXT_PUBLIC_FF_BILLING_ENABLED;
  if (bill === "true") out.FF_BILLING_ENABLED = true;
  if (bill === "false") out.FF_BILLING_ENABLED = false;
  return out;
}
import { setHealthStorageMode, useHealthStore } from "@/lib/store";

export function HealthBootstrap({ children }: { children: React.ReactNode }) {
  const { status, getAccessToken, user } = useCognitoAuth();

  useEffect(() => {
    if (!isAwsBackendEnabled()) {
      setHealthStorageMode(false);
      return;
    }

    if (status !== "authenticated") {
      setHealthStorageMode(false);
      if (user?.id) clearUserFlagOverrides(user.id);
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
      const flagResult = await getFeatureFlagOverrides(accessToken);

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

      if (flagResult.ok && user?.id) {
        setUserFlagOverrides(user.id, mergeNextPublicFeatureFlags(flagResult.data.overrides));
      }
    })();
  }, [getAccessToken, status, user?.id]);

  return <>{children}</>;
}
