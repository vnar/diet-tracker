"use client";

import { ExternalLink } from "lucide-react";
import { RoadmapInfoCard } from "@/components/v2/roadmap/RoadmapInfoCard";
import { track } from "@/lib/analytics";

const APPLE = "https://support.apple.com/guide/iphone/export-your-health-data-iph9532d9b6f/ios";
const GOOGLE = "https://support.google.com/fit/answer/3026397";

export function WearablesExportGuidePanel() {
  return (
    <RoadmapInfoCard eyebrow="Wearables" title="Export health data (manual bridge)">
      <p>
        Until direct sync ships, you can export from Apple Health or Google Fit and keep logging key numbers
        here by hand.
      </p>
      <ul className="space-y-1.5 text-zinc-300">
        <li>
          <a
            href={APPLE}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-emerald-400 hover:underline"
            onClick={() => track("wearables_apple_export_link", {})}
          >
            Apple Health export steps <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </li>
        <li>
          <a
            href={GOOGLE}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-emerald-400 hover:underline"
            onClick={() => track("wearables_google_export_link", {})}
          >
            Google Fit data export <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </li>
      </ul>
    </RoadmapInfoCard>
  );
}
