"use client";

import { useSession } from "next-auth/react";
import { LoginLanding } from "@/components/LoginLanding";
import { HealthDashboard } from "@/components/HealthDashboard";

/** Client session gate — static export cannot use `await auth()` on the server. */
export default function Home() {
  const { status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-zinc-500 dark:text-slate-400">
        Loading…
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <LoginLanding />;
  }

  return <HealthDashboard />;
}
