"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { AIInsights } from "@/components/AIInsights";
import { PhotoTrackerAiComparePanel } from "@/components/v2/photos/PhotoTrackerAiComparePanel";

function CollapsibleBlock({
  id,
  detailsId,
  title,
  children,
}: {
  id: string;
  /** On `<details>` for `scrollIntoView` / programmatic `open` from the photo column. */
  detailsId?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <details
      id={detailsId}
      className="group rounded-xl border border-zinc-800/90 bg-zinc-950/25 open:border-zinc-700/90"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold text-zinc-100 [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <ChevronDown
          aria-hidden
          className="h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-zinc-800/80 px-3 pb-3 pt-1" id={id}>
        {children}
      </div>
    </details>
  );
}

/** Full-width AI coaching + photo compare, each in its own native collapsible. */
export function DashboardAiInsightsHub() {
  return (
    <Card title="AI insights" variant="surface" className="flex flex-col gap-2">
      <CollapsibleBlock id="ai-insights-coaching" detailsId="ai-insights-coaching-details" title="Coaching insights">
        <AIInsights embedded />
      </CollapsibleBlock>
      <CollapsibleBlock
        id="ai-insights-photo-compare"
        detailsId="ai-insights-photo-compare-details"
        title="Photo compare (AI)"
      >
        <PhotoTrackerAiComparePanel embedded />
      </CollapsibleBlock>
    </Card>
  );
}
