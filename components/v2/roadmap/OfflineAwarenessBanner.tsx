"use client";

import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function OfflineAwarenessBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      className="flex items-start gap-2 rounded-xl border border-amber-600/40 bg-amber-950/40 px-3 py-2.5 text-xs text-amber-100"
      role="status"
      aria-live="polite"
    >
      <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
      <p>
        You appear offline. Keep logging — your device will sync weight and meals when the connection returns
        (always verify after reconnect).
      </p>
    </div>
  );
}
