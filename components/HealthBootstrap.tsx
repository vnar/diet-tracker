"use client";

import { useEffect } from "react";
import { useCognitoAuth } from "@/components/CognitoAuthProvider";
import { SubscriptionProvider, useSubscriptionSnapshot } from "@/components/v2/billing/SubscriptionContext";
import { sortEntriesByDateAsc } from "@/lib/calculations";
import {
  getFeatureFlagOverrides,
  getEntries,
  getSettings,
  isAwsBackendEnabled,
} from "@/lib/frontend-api-client";
import { clearUserFlagOverrides, setUserFlagOverrides } from "@/lib/featureFlags";
import { setHealthStorageMode, useHealthStore } from "@/lib/store";

/** NEXT_PUBLIC_* wins over `/feature-flags` so Amplify / `.env.local` can turn on gated UI without redeploying Lambda. */
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
  const proMon = process.env.NEXT_PUBLIC_FF_PRO_MONETIZATION;
  if (proMon === "true") out.FF_PRO_MONETIZATION = true;
  if (proMon === "false") out.FF_PRO_MONETIZATION = false;
  const bodyAi = process.env.NEXT_PUBLIC_FF_BODY_COMPARE_AI;
  if (bodyAi === "true") out.FF_BODY_COMPARE_AI = true;
  if (bodyAi === "false") out.FF_BODY_COMPARE_AI = false;
  const coach = process.env.NEXT_PUBLIC_FF_PERSONALIZED_AI_COACHING;
  if (coach === "true") out.FF_PERSONALIZED_AI_COACHING = true;
  if (coach === "false") out.FF_PERSONALIZED_AI_COACHING = false;
  return out;
}

function HealthBootstrapInner({ children }: { children: React.ReactNode }) {
  const { status, getAccessToken, user } = useCognitoAuth();
  const { setSubscription } = useSubscriptionSnapshot();

  useEffect(() => {
    if (!isAwsBackendEnabled()) {
      setHealthStorageMode(false);
      setSubscription(null);
      return;
    }

    if (status !== "authenticated") {
      setHealthStorageMode(false);
      setSubscription(null);
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
        setSubscription(settingsResult.data.subscription ?? null);
      } else {
        const retry = await getSettings(accessToken);
        if (retry.ok) {
          useHealthStore.setState({
            settings: retry.data.settings,
          });
          setSubscription(retry.data.subscription ?? null);
        }
      }

      if (user?.id) {
        const base = flagResult.ok ? flagResult.data.overrides : {};
        setUserFlagOverrides(user.id, mergeNextPublicFeatureFlags(base));
      }
    })();
  }, [getAccessToken, status, user?.id, setSubscription]);

  return <>{children}</>;
}

export function HealthBootstrap({ children }: { children: React.ReactNode }) {
  return (
    <SubscriptionProvider>
      <HealthBootstrapInner>{children}</HealthBootstrapInner>
    </SubscriptionProvider>
  );
}
