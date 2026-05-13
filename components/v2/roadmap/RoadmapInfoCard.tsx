"use client";

import type { ReactNode } from "react";

export function RoadmapInfoCard({
  title,
  eyebrow,
  children,
}: {
  eyebrow?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="h-full rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3 shadow-sm">
      {eyebrow ? (
        <p className="text-[9px] font-semibold uppercase tracking-wide text-emerald-400/90">{eyebrow}</p>
      ) : null}
      <p className="text-xs font-semibold leading-snug text-zinc-100">{title}</p>
      <div className="mt-1.5 space-y-1.5 text-[11px] leading-relaxed text-zinc-400">{children}</div>
    </div>
  );
}
