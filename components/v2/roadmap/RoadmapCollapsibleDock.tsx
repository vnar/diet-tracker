"use client";

import { ChevronDown } from "lucide-react";
import { WorkingRoadmapFeatures } from "@/components/v2/roadmap/WorkingRoadmapFeatures";
import { DiscoveryTeasers } from "@/components/v2/roadmap/DiscoveryTeasers";

export function RoadmapCollapsibleDock({ userId }: { userId?: string }) {
  if (!userId) return null;

  return (
    <details className="group/dock mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/25 open:border-zinc-700">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-zinc-200 marker:content-none [&::-webkit-details-marker]:hidden">
        <span>More tools &amp; roadmap</span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open/dock:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="space-y-4 border-t border-zinc-800 px-4 py-4">
        <p className="text-[11px] leading-relaxed text-zinc-500">
          Working tools use data you have already logged. Betas below are off by default — turn each on with{" "}
          <code className="rounded bg-zinc-800 px-1 text-[10px] text-zinc-300">NEXT_PUBLIC_FF_*</code> or a per-user
          admin override when you want to try them.
        </p>
        <WorkingRoadmapFeatures userId={userId} />

        <details className="rounded-xl border border-zinc-800 bg-zinc-950/40">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-semibold text-zinc-400 marker:content-none [&::-webkit-details-marker]:hidden">
            <span>Coming soon &amp; betas</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-600" aria-hidden />
          </summary>
          <div className="space-y-3 border-t border-zinc-800 p-3">
            <DiscoveryTeasers userId={userId} />
          </div>
        </details>
      </div>
    </details>
  );
}
