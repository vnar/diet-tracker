"use client";

import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/** Always shown when the browser reports offline (no feature flag). */
export function GlobalOfflineStrip() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      className="mb-3 flex items-start gap-2 rounded-xl border border-amber-600/50 bg-amber-950/50 px-3 py-2 text-xs text-amber-100"
      role="status"
      aria-live="polite"
    >
      <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
      <p>
        You are offline. Keep logging; your device will sync when the connection returns. Re-open the app
        after reconnecting to confirm saves.
      </p>
    </div>
  );
}
