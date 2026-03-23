"use client";

import { signOut, useSession } from "next-auth/react";
import { LogOut } from "lucide-react";

/** Shown on the dashboard header when signed in. Landing login uses / only. */
export function AuthBar() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return null;
  }

  if (session?.user) {
    return (
      <div className="flex items-center gap-2">
        <span className="mr-1 hidden max-w-[220px] truncate text-xs text-zinc-500 sm:block">
          {session.user.name ?? session.user.email}
        </span>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="h-7 rounded-lg px-2.5 text-[11px] text-zinc-500 transition-all hover:bg-zinc-800 hover:text-zinc-300"
        >
          <span className="inline-flex items-center gap-1.5">
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            Sign out
          </span>
        </button>
      </div>
    );
  }

  return null;
}
