"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { RoadmapInfoCard } from "@/components/v2/roadmap/RoadmapInfoCard";
import { track } from "@/lib/analytics";

export function DeveloperContextPanel() {
  const sha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  return (
    <RoadmapInfoCard eyebrow="Developers" title="Web app context (support)">
      <p className="break-all font-mono text-[10px] text-zinc-500">
        Origin: {origin || "(loading)"}
        <br />
        Build: {sha && sha.length > 0 ? sha : "local / unknown"}
      </p>
      <Link
        href="https://github.com/vnar/diet-tracker"
        className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:underline"
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track("roadmap_developer_clicked", {})}
      >
        Repository & releases <ExternalLink className="h-3 w-3" aria-hidden />
      </Link>
    </RoadmapInfoCard>
  );
}
