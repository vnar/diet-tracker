"use client";

import { LoginForm } from "@/components/LoginForm";
import { OjasMarketingShell } from "@/components/v2/marketing/OjasMarketingShell";

export function LoginLanding() {
  return (
    <OjasMarketingShell>
      <div className="rounded-xl border border-zinc-200/90 bg-white p-4 shadow-lg shadow-zinc-900/5 ring-1 ring-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-900/80 dark:shadow-black/40 dark:ring-white/5 sm:p-4">
        <LoginForm compact />
      </div>
    </OjasMarketingShell>
  );
}
