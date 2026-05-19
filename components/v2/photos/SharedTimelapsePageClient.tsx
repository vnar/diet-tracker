"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getPublicTimelapseShare, isAwsBackendEnabled } from "@/lib/frontend-api-client";
import { SharedTimelapseViewer } from "@/components/v2/photos/SharedTimelapseViewer";
import type { PublicTimelapseSharePayload } from "@/lib/share/timelapseShare";
import { MARKETING_SITE_URL } from "@/lib/marketing/siteCopy";

export function SharedTimelapsePageClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("t")?.trim() ?? "";

  const [payload, setPayload] = useState<PublicTimelapseSharePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError("Missing share token. Use the full link from the person who shared their progress.");
      setLoading(false);
      return;
    }
    if (!isAwsBackendEnabled()) {
      setError("Share links require the cloud backend. Try again on ojas-health.com.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    void getPublicTimelapseShare(token).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setPayload(res.data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-black text-sm text-zinc-400">
        Loading progress timelapse…
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-black px-6 text-center">
        <p className="text-lg font-semibold text-white">This link isn&apos;t available</p>
        <p className="max-w-md text-sm text-zinc-400">{error ?? "The share may have expired or been revoked."}</p>
        <Link
          href={MARKETING_SITE_URL}
          className="rounded-lg border border-emerald-600/50 bg-emerald-950/50 px-4 py-2 text-sm font-semibold text-emerald-100"
        >
          Visit ojas-health.com
        </Link>
      </div>
    );
  }

  return <SharedTimelapseViewer payload={payload} />;
}
