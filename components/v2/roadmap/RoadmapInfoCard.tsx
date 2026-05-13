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
    <div className="rounded-xl border border-zinc-700/80 bg-zinc-900/50 p-4">
      {eyebrow ? (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400/90">{eyebrow}</p>
      ) : null}
      <p className="text-sm font-semibold text-zinc-100">{title}</p>
      <div className="mt-2 space-y-2 text-xs leading-relaxed text-zinc-400">{children}</div>
    </div>
  );
}
