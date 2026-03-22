"use client";

import { signOut, useSession } from "next-auth/react";
import { LogOut } from "lucide-react";

/** Shown on the dashboard header when signed in. Landing login uses / only. */
export function AuthBar() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <span className="text-xs text-slate-500 dark:text-slate-400">…</span>
    );
  }

  if (session?.user) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="max-w-[200px] truncate text-sm text-slate-600 dark:text-slate-200">
          {session.user.name ?? session.user.email}
        </span>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 underline underline-offset-4 transition-colors hover:text-emerald-500 dark:text-emerald-300 dark:hover:text-emerald-200"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Log out
        </button>
      </div>
    );
  }

  return null;
}
