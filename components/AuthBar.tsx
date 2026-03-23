"use client";

import { Cloud, LogOut } from "lucide-react";
import { useCognitoAuth } from "@/components/CognitoAuthProvider";
import { isAwsBackendEnabled } from "@/lib/frontend-api-client";

export function AuthBar({ compact = false }: { compact?: boolean }) {
  const usingAws = isAwsBackendEnabled();
  const { status, user, signOut } = useCognitoAuth();

  if (status === "loading") {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400">
        <Cloud className="h-3.5 w-3.5 shrink-0" />
        <span className={compact ? "hidden" : "inline"}>
          {usingAws ? "AWS mode" : "Local mode"}
        </span>
      </span>
      {usingAws && user ? (
        <>
          <span className="mr-1 hidden max-w-[220px] truncate text-xs text-zinc-500 sm:block">
            {user.name ?? user.email}
          </span>
          <button
            type="button"
            onClick={signOut}
            className="h-7 rounded-lg px-2.5 text-[11px] text-zinc-500 transition-all hover:bg-zinc-800 hover:text-zinc-300"
          >
            <span className="inline-flex items-center gap-1.5">
              <LogOut className="h-3.5 w-3.5 shrink-0" />
              <span className={compact ? "hidden" : "inline"}>Sign out</span>
            </span>
          </button>
        </>
      ) : null}
    </div>
  );
}
