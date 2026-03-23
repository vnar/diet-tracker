"use client";

import { useState } from "react";
import { ChevronUp, FileText } from "lucide-react";
import { AWS_SERVICES, CHANGELOG, type AWSService } from "@/lib/aws-services";

function ServicePill({ service }: { service: AWSService }) {
  const [showTip, setShowTip] = useState(false);
  const isOnline = service.status === "online";

  return (
    <div className="relative">
      <div
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        className="flex cursor-default items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5"
      >
        <service.Icon size={10} className={service.iconColor} />
        <div
          className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
            isOnline ? "bg-emerald-500" : "bg-rose-500"
          }`}
        />
        <span className="text-[10px] text-zinc-400">{service.shortName}</span>
      </div>

      {showTip ? (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300 shadow-xl">
          {service.fullName} · {isOnline ? "Online" : "Offline"}
        </div>
      ) : null}
    </div>
  );
}

export function AppFooter() {
  const [changelogOpen, setChangelogOpen] = useState(false);

  return (
    <footer className="border-t border-zinc-800/60 bg-zinc-950/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-5 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[9px] font-medium uppercase tracking-widest text-zinc-600">
            AWS
          </span>
          {AWS_SERVICES.map((svc) => (
            <ServicePill key={svc.id} service={svc} />
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            <span className="text-[10px] text-zinc-500">All systems online</span>
          </div>
          <div className="h-3 w-px bg-zinc-800" />
          <button
            onClick={() => setChangelogOpen(!changelogOpen)}
            className="flex items-center gap-1.5 text-[10px] text-zinc-500 transition-colors hover:text-zinc-300"
            type="button"
          >
            <FileText size={10} />
            <span>v1.0.0</span>
            <ChevronUp
              size={9}
              className={`transition-transform duration-200 ${changelogOpen ? "" : "rotate-180"}`}
            />
          </button>
        </div>
      </div>

      {changelogOpen ? (
        <div className="border-t border-zinc-800/60">
          <div className="mx-auto flex max-w-5xl flex-col gap-2 px-5 py-3">
            {CHANGELOG.map((entry) => (
              <div key={entry.version} className="flex items-start gap-3">
                <span className="w-14 flex-shrink-0 text-[10px] font-mono text-zinc-600">
                  {entry.version}
                </span>
                <span className="w-20 flex-shrink-0 text-[10px] text-zinc-600">
                  {entry.date}
                </span>
                <span className="text-[10px] text-zinc-400">{entry.note}</span>
                {entry.latest ? (
                  <span className="ml-auto whitespace-nowrap rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-400">
                    latest
                  </span>
                ) : null}
              </div>
            ))}
            {/* FREEFORM SLOT — Vihar will design and share */}
            {/* <FreeformWidget /> */}
          </div>
        </div>
      ) : null}
    </footer>
  );
}
