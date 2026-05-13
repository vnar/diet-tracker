"use client";

import { ChevronDown } from "lucide-react";
import { WorkingRoadmapFeatures } from "@/components/v2/roadmap/WorkingRoadmapFeatures";
import { DiscoveryTeasers } from "@/components/v2/roadmap/DiscoveryTeasers";

export function RoadmapCollapsibleDock({ userId }: { userId?: string }) {
  if (!userId) return null;

  return (
    <details className="group/dock mt-6 overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-900/35 shadow-sm open:border-zinc-700/90">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-zinc-200 marker:content-none [&::-webkit-details-marker]:hidden hover:bg-zinc-800/20">
        <span>More tools &amp; roadmap</span>
        <ChevronDown
          className="h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform group-open/dock:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="space-y-2 border-t border-zinc-800/80 p-3">
        <div className="rounded-lg border border-zinc-800/70 bg-zinc-950/35 px-2.5 py-2">
          <p className="text-[10px] leading-relaxed text-zinc-500">
            Working tools use data you have already logged. Betas below are off by default — turn each on with{" "}
            <code className="rounded bg-zinc-800/90 px-1 py-px font-mono text-[9px] text-zinc-300">NEXT_PUBLIC_FF_*</code>{" "}
            or a per-user admin override when you want to try them.
          </p>
        </div>
        <WorkingRoadmapFeatures userId={userId} />

        <details className="group/betas overflow-hidden rounded-lg border border-zinc-800/70 bg-zinc-950/30">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2 text-[11px] font-medium text-zinc-400 marker:content-none [&::-webkit-details-marker]:hidden hover:bg-zinc-800/25">
            <span>Coming soon &amp; betas</span>
            <ChevronDown
              className="h-3 w-3 shrink-0 text-zinc-600 transition-transform group-open/betas:rotate-180"
              aria-hidden
            />
          </summary>
          <div className="border-t border-zinc-800/70 p-2">
            <DiscoveryTeasers userId={userId} />
          </div>
        </details>
      </div>
    </details>
  );
}
