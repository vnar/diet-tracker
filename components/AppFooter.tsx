"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronUp, ExternalLink, Github, Info, Server } from "lucide-react";
import { AWS_SERVICES, CHANGELOG } from "@/lib/aws-services";
import { getFooterStats, isAwsBackendEnabled, trackPageView } from "@/lib/frontend-api-client";
import { useCognitoAuth } from "@/components/CognitoAuthProvider";

export function AppFooter() {
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [users, setUsers] = useState<number | null>(null);
  const [pageViews, setPageViews] = useState<number | null>(null);
  const pageViewTracked = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { status, getAccessToken } = useCognitoAuth();
  const costDashboardUrl =
    process.env.NEXT_PUBLIC_COST_DASHBOARD_URL ??
    "https://console.aws.amazon.com/costmanagement/home#/cost-explorer";

  useEffect(() => {
    if (!isAwsBackendEnabled() || status !== "authenticated") {
      return;
    }

    void (async () => {
      const token = await getAccessToken();
      if (!token) return;

      if (!pageViewTracked.current) {
        pageViewTracked.current = true;
        await trackPageView(token);
      }

      const stats = await getFooterStats(token);
      if (stats.ok) {
        setUsers(stats.data.users);
        setPageViews(stats.data.pageViews);
      }
    })();
  }, [getAccessToken, status]);

  useEffect(() => {
    const closeAll = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      if (target?.closest("[data-footer-menu]")) return;
      setAboutOpen(false);
      setChangelogOpen(false);
    };
    window.addEventListener("mousedown", closeAll);
    return () => window.removeEventListener("mousedown", closeAll);
  }, []);

  function toggleAbout() {
    setAboutOpen((v) => !v);
    setChangelogOpen(false);
  }

  function toggleVersion() {
    setChangelogOpen((v) => !v);
    setAboutOpen(false);
  }

  return (
    <footer className="ojas-footer" ref={rootRef}>
      <div className="flex min-w-0 items-center gap-1">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "rgba(220,238,226,0.28)" }}>
          AWS
        </span>
        {AWS_SERVICES.map((svc) => (
          <span key={svc.id} className="ojas-service-pill">
            <span className="h-1 w-1 rounded-full" style={{ background: svc.status === "online" ? "#3DDB7A" : "#F43F5E" }} />
            {svc.shortName}
          </span>
        ))}
      </div>

      <span className="ojas-divider" />
      <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--mu)" }}>
        <span>{users ?? "-"}</span>
        <span>users</span>
        <span>/</span>
        <span>{pageViews ?? "-"}</span>
        <span>views</span>
      </div>
      <span className="ojas-divider" />
      <div className="flex items-center gap-1 text-[10px]" style={{ color: "var(--g2)" }}>
        <span className="ojas-pulse-dot" />
        <span>All systems online</span>
      </div>
      <span className="ojas-divider" />
      <a
        href={costDashboardUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-[10px] transition-opacity hover:opacity-90"
        style={{ color: "var(--mu2)" }}
      >
        Cost <ExternalLink size={10} />
      </a>

      <div className="ml-auto flex items-center gap-1" data-footer-menu>
        <button
          type="button"
          aria-label="About Ojas Health"
          onClick={toggleAbout}
          className="flex h-6 w-6 items-center justify-center rounded-md border transition"
          style={{
            color: aboutOpen ? "var(--txt)" : "var(--mu)",
            borderColor: aboutOpen ? "var(--b2)" : "transparent",
            background: aboutOpen ? "var(--s2)" : "transparent",
          }}
        >
          <Info size={14} />
        </button>
        <span className="h-4 w-px" style={{ background: "rgba(255,255,255,0.06)" }} />
        <button
          type="button"
          onClick={toggleVersion}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 transition"
          style={{
            color: changelogOpen ? "var(--txt)" : "var(--mu)",
            borderColor: changelogOpen ? "var(--b2)" : "transparent",
            background: changelogOpen ? "var(--s2)" : "transparent",
          }}
        >
          <Github size={12} />
          <span className="font-mono text-[10px] font-bold" style={{ color: "var(--g)" }}>v2.0.0</span>
          <ChevronUp size={10} className={changelogOpen ? "" : "rotate-180"} />
        </button>
      </div>

      {aboutOpen ? (
        <div className="ojas-dropdown" data-footer-menu style={{ minWidth: 230 }}>
          <div className="border-b px-3 py-3" style={{ borderColor: "var(--b)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--txt)" }}>Ojas · Health</p>
            <p className="mt-1 text-[11px]" style={{ color: "var(--mu)" }}>
              AI-powered daily awareness dashboard for weight, meals, and habits.
            </p>
          </div>
          <a className="flex items-center gap-2 px-3 py-2 text-[11px] hover:bg-white/5" href="https://github.com/vnar" target="_blank" rel="noreferrer">
            <Github size={14} /> <span style={{ color: "var(--mu)" }}>GitHub</span> <span className="ml-auto" style={{ color: "var(--txt)" }}>vnar</span>
          </a>
          <div className="flex items-center gap-2 px-3 py-2 text-[11px] hover:bg-white/5">
            <Server size={14} /> <span style={{ color: "var(--mu)" }}>Infrastructure</span> <span className="ml-auto" style={{ color: "var(--txt)" }}>AWS</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 text-[11px] hover:bg-white/5">
            <span className="w-4 text-center">D</span> <span style={{ color: "var(--mu)" }}>Data</span> <span className="ml-auto" style={{ color: "var(--txt)" }}>DynamoDB + S3</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 text-[11px] hover:bg-white/5">
            <span className="w-4 text-center">AI</span> <span style={{ color: "var(--mu)" }}>AI</span> <span className="ml-auto" style={{ color: "var(--txt)" }}>Anthropic</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 text-[11px] hover:bg-white/5">
            <span className="w-4 text-center">©</span> <span style={{ color: "var(--mu)" }}>License</span> <span className="ml-auto" style={{ color: "var(--txt)" }}>Private</span>
          </div>
        </div>
      ) : null}

      {changelogOpen ? (
        <div className="ojas-dropdown" data-footer-menu style={{ minWidth: 300 }}>
          <div className="border-b px-3 py-2.5" style={{ borderColor: "var(--b)" }}>
            <p className="text-[11px] font-semibold" style={{ color: "var(--txt)" }}>Changelog</p>
            <p className="text-[10px]" style={{ color: "var(--mu)" }}>vnar / ojas-health</p>
          </div>
          {CHANGELOG.map((entry, index) => (
            <div
              key={entry.version}
              className="flex items-start gap-2 border-b px-3 py-2 hover:bg-white/5"
              style={{ borderColor: "rgba(255,255,255,0.03)", opacity: Math.max(0.55, 0.9 - index * 0.1) }}
            >
              <span className="w-12 font-mono text-[11px] font-bold" style={{ color: entry.latest ? "var(--g)" : "var(--mu)" }}>
                {entry.version}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px]" style={{ color: "var(--mu2)" }}>{entry.note}</p>
                <p className="text-[10px]" style={{ color: "var(--mu)" }}>{entry.date}</p>
              </div>
              <span className="rounded px-1.5 py-0.5 text-[9px]" style={{ background: entry.latest ? "var(--g3)" : "rgba(96,165,250,0.16)", color: entry.latest ? "var(--g)" : "#93c5fd" }}>
                {entry.latest ? "current" : "fix"}
              </span>
            </div>
          ))}
          <a
            href="https://github.com/vnar/ojas-health/releases"
            target="_blank"
            rel="noreferrer"
            className="block px-3 py-2 text-[10px] hover:bg-white/5"
            style={{ color: "var(--mu2)" }}
          >
            All releases on GitHub
          </a>
        </div>
      ) : null}
    </footer>
  );
}
