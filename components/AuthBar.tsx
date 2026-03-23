"use client";

import { signOut, useSession } from "next-auth/react";
import { LogOut } from "lucide-react";

/** Shown on the dashboard header when signed in. Landing login uses / only. */
export function AuthBar() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <span className="inline-flex h-10 items-center text-sm font-medium text-slate-400">
        …
      </span>
    );
  }

  if (session?.user) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="max-w-[220px] truncate text-sm font-medium leading-none text-slate-300">
          {session.user.name ?? session.user.email}
        </span>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="inline-flex h-10 items-center gap-1.5 text-sm font-medium text-emerald-400 underline underline-offset-4 transition-colors hover:text-emerald-300"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Log out
        </button>
      </div>
    );
  }

  return null;
}
