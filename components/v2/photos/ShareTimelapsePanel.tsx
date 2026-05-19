"use client";

import { useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { useCognitoAuth } from "@/components/CognitoAuthProvider";
import { createTimelapseShareLink } from "@/lib/frontend-api-client";
import { isProgressTimelapseShareEnabled } from "@/lib/featureFlags";
import { useHealthStore } from "@/lib/store";
import { track } from "@/lib/analytics";

type Props = {
  photoCount: number;
  canTimelapse: boolean;
};

/** Create a public share link for the progress photo timelapse (feature-flagged). */
export function ShareTimelapsePanel({ photoCount, canTimelapse }: Props) {
  const { user, getAccessToken } = useCognitoAuth();
  const unit = useHealthStore((s) => s.settings.unit);
  const enabled = isProgressTimelapseShareEnabled(user?.id);

  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!enabled || !canTimelapse) return null;

  async function onCreateLink() {
    setError(null);
    setCopied(false);
    const token = await getAccessToken();
    if (!token) {
      setError("Sign in to create a share link.");
      return;
    }
    setBusy(true);
    try {
      const res = await createTimelapseShareLink(token, { includeWeight: true, unit });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setShareUrl(res.data.url);
      track("timelapse_share_created", { photoCount, unit });
    } finally {
      setBusy(false);
    }
  }

  async function onCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      track("timelapse_share_copied", { photoCount });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy — select the link and copy manually.");
    }
  }

  return (
    <div className="mt-2 shrink-0 rounded-xl border border-sky-500/30 bg-sky-950/20 p-2.5">
      <p className="text-[11px] font-medium text-zinc-200">Share your progress timelapse</p>
      <p className="mt-1 text-[10px] leading-snug text-zinc-500">
        Anyone with the link can watch — no Ojas account needed. Includes upbeat music and branding.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onCreateLink()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/45 bg-sky-500/15 px-3 py-2 text-xs font-semibold text-sky-100 hover:bg-sky-500/25 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Link2 className="h-3.5 w-3.5" aria-hidden />}
          {busy ? "Creating…" : "Create share link"}
        </button>
        {shareUrl ? (
          <button
            type="button"
            onClick={() => void onCopy()}
            className="rounded-lg border border-zinc-600 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
        ) : null}
      </div>
      {shareUrl ? (
        <p className="mt-2 break-all text-[10px] text-zinc-400">{shareUrl}</p>
      ) : null}
      {error ? <p className="mt-2 text-[10px] text-rose-300">{error}</p> : null}
    </div>
  );
}
