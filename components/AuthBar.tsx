"use client";

import { Cloud, LogOut } from "lucide-react";
import { useCognitoAuth } from "@/components/CognitoAuthProvider";
import { isAwsBackendEnabled } from "@/lib/frontend-api-client";

export function AuthBar({
  compact = false,
  /** When false, use `<SignOutButton />` separately (e.g. rightmost in header). */
  showSignOut = true,
}: {
  compact?: boolean;
  showSignOut?: boolean;
}) {
  const usingAws = isAwsBackendEnabled();
  const { status, user, signOut } = useCognitoAuth();

  if (status === "loading") {
    return null;
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white/90 px-2 py-1 text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-400">
        <Cloud className="h-3.5 w-3.5 shrink-0" />
        <span className={compact ? "hidden" : "inline"}>
          {usingAws ? "AWS mode" : "Local mode"}
        </span>
      </span>
      {usingAws && user ? (
        <>
          <span className="mr-0.5 hidden max-w-[180px] truncate text-xs text-zinc-600 dark:text-zinc-500 sm:block">
            {user.name ?? user.email}
          </span>
          {showSignOut ? (
            <button
              type="button"
              onClick={() => void signOut()}
              className="h-7 shrink-0 rounded-lg px-2 text-[11px] text-zinc-600 transition-all hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            >
              <span className="inline-flex items-center gap-1.5">
                <LogOut className="h-3.5 w-3.5 shrink-0" />
                <span className={compact ? "hidden" : "inline"}>Sign out</span>
              </span>
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Rightmost header control: sign out (AWS + signed in only). */
export function SignOutButton({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const usingAws = isAwsBackendEnabled();
  const { status, user, signOut } = useCognitoAuth();

  if (!usingAws || status !== "authenticated" || !user) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      className={`inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 text-[11px] font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:shadow-none dark:hover:bg-zinc-700 ${className}`}
      title="Sign out"
    >
      <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {!compact ? <span>Sign out</span> : <span className="sr-only">Sign out</span>}
    </button>
  );
}
