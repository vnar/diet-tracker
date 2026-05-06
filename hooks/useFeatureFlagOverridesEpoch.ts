"use client";

import { useSyncExternalStore } from "react";
import { getFeatureFlagOverridesEpoch, subscribeFeatureFlagOverrides } from "@/lib/featureFlags";

/** Re-renders when `/feature-flags` (or similar) updates the in-memory override cache. */
export function useFeatureFlagOverridesEpoch(): number {
  return useSyncExternalStore(
    subscribeFeatureFlagOverrides,
    getFeatureFlagOverridesEpoch,
    getFeatureFlagOverridesEpoch,
  );
}
