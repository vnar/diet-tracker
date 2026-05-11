"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { AIInsights } from "@/components/AIInsights";
import { PhotoTrackerAiComparePanel } from "@/components/v2/photos/PhotoTrackerAiComparePanel";
import { WeeklyReportCollapsible } from "@/components/v2/weeklyReport/WeeklyReportCollapsible";

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

/** Weekly recap (own card) + AI coaching + photo compare so email/send is not buried under “Coaching insights”. */
export function DashboardAiInsightsHub() {
  return (
    <div className="flex flex-col gap-3">
      <Card title="Weekly recap & email" variant="surface" className="flex flex-col gap-2">
        <p className="text-[12px] leading-snug text-zinc-400">
          Your seven-day summary lives here — not inside Coaching insights. Tap{" "}
          <span className="font-semibold text-zinc-200">Generate</span>, then{" "}
          <span className="font-semibold text-emerald-200/90">Email to my inbox</span> (verified Cognito email).
        </p>
        <WeeklyReportCollapsible />
      </Card>
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
    </div>
  );
}
