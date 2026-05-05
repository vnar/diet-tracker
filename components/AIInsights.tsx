"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { useCognitoAuth } from "@/components/CognitoAuthProvider";
import { isInsightsV2Enabled } from "@/lib/featureFlags";
import { isAwsBackendEnabled } from "@/lib/frontend-api-client";
import { InsightsPanel } from "@/components/v2/insights/InsightsPanel";

export function AIInsights() {
  const { status, getAccessToken, user } = useCognitoAuth();
  const v2Enabled = useMemo(() => isInsightsV2Enabled(user?.id), [user?.id]);
  const token = getAccessToken();
  const canRenderPanel =
    v2Enabled && isAwsBackendEnabled() && status === "authenticated" && typeof token === "string";

  return (
    <Card title="Insights" variant="surface">
      {!canRenderPanel ? (
        <p className="text-[15px] font-medium leading-relaxed text-slate-400">
          No nudges right now — keep logging.
        </p>
      ) : (
        <InsightsPanel accessToken={token} />
      )}
    </Card>
  );
}
