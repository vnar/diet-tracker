"use client";

import { useCognitoAuth } from "@/components/CognitoAuthProvider";
import { HealthDashboard } from "@/components/HealthDashboard";
import { LoginLanding } from "@/components/LoginLanding";
import { isAwsBackendEnabled } from "@/lib/frontend-api-client";

export default function Home() {
  const { status } = useCognitoAuth();
  const usingAws = isAwsBackendEnabled();

  if (!usingAws) {
    return (
      <main id="app-main">
        <HealthDashboard />
      </main>
    );
  }

  if (status === "loading") {
    return (
      <main id="app-main" className="flex min-h-[50vh] items-center justify-center bg-zinc-50 text-sm text-zinc-600 dark:bg-zinc-950 dark:text-slate-400">
        Loading...
      </main>
    );
  }

  if (status === "unauthenticated") {
    return <LoginLanding />;
  }

  return (
    <main id="app-main">
      <HealthDashboard />
    </main>
  );
}
