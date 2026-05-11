"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { useCognitoAuth } from "@/components/CognitoAuthProvider";
import { isInsightsV2Enabled } from "@/lib/featureFlags";
import { isAwsBackendEnabled } from "@/lib/frontend-api-client";
import { InsightsPanel } from "@/components/v2/insights/InsightsPanel";

export function AIInsights({ embedded = false }: { embedded?: boolean }) {
  const { status, getAccessToken, user } = useCognitoAuth();
  const v2Enabled = useMemo(() => isInsightsV2Enabled(user?.id), [user?.id]);
  const token = getAccessToken();
  const canRenderPanel =
    v2Enabled && isAwsBackendEnabled() && status === "authenticated" && typeof token === "string";

  const body = !canRenderPanel ? (
    <p className="text-[13px] font-medium text-slate-400">Nothing yet.</p>
  ) : (
    <InsightsPanel accessToken={token} />
  );

  if (embedded) {
    return <div className="flex min-h-0 flex-1 flex-col pt-1">{body}</div>;
  }

  return (
    <Card title="Insights" variant="surface" className="flex min-h-0 flex-1 flex-col">
      {body}
    </Card>
  );
}
