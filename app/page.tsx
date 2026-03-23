"use client";

import { useCognitoAuth } from "@/components/CognitoAuthProvider";
import { HealthDashboard } from "@/components/HealthDashboard";
import { LoginLanding } from "@/components/LoginLanding";
import { isAwsBackendEnabled } from "@/lib/frontend-api-client";

export default function Home() {
  const { status } = useCognitoAuth();
  const usingAws = isAwsBackendEnabled();

  if (!usingAws) {
    return <HealthDashboard />;
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-zinc-500 dark:text-slate-400">
        Loading...
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <LoginLanding />;
  }

  return <HealthDashboard />;
}
