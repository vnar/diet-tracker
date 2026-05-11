"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { track } from "@/lib/analytics";
import { proFeatureCopy, type ProFeatureKey } from "@/lib/billing/proGate";

type Props = {
  open: boolean;
  onClose: () => void;
  featureKey: ProFeatureKey;
  /** Where the user hit the gate (analytics). */
  surface: string;
};

export function ProGateModal({ open, onClose, featureKey, surface }: Props) {
  const copy = proFeatureCopy(featureKey);

  useEffect(() => {
    if (!open) return;
    track("paywall_viewed", { feature: featureKey, surface });
  }, [open, featureKey, surface]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[215] flex items-end justify-center bg-black/75 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-violet-500/25 bg-gradient-to-b from-violet-950/50 to-zinc-950 shadow-2xl ring-1 ring-violet-400/15"
      >
        <div className="flex items-start justify-between gap-3 border-b border-violet-500/15 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 ring-1 ring-violet-400/25">
              <Sparkles className="h-4 w-4 text-violet-200" aria-hidden />
            </span>
            <p className="text-sm font-semibold leading-tight text-zinc-50">Unlock with Pro</p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-4 py-4">
          <p className="text-[13px] font-semibold text-violet-100">{copy.title}</p>
          <p className="text-[12px] leading-relaxed text-zinc-300">{copy.body}</p>
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Your saved weights, days, and history stay yours — Pro adds smarter shortcuts, not a lock on
            what you already logged.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              href="/account/billing"
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
              onClick={() =>
                track("upgrade_clicked", {
                  feature: featureKey,
                  surface: "pro_gate_modal",
                  from_surface: surface,
                })
              }
            >
              View Pro plans
            </Link>
            <button
              type="button"
              className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
              onClick={onClose}
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
