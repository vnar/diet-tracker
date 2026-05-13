"use client";

import { useCognitoAuth } from "@/components/CognitoAuthProvider";
import { HealthDashboard } from "@/components/HealthDashboard";
import { HomeLoadingScreen } from "@/components/v2/marketing/HomeLoadingScreen";
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
    return <HomeLoadingScreen />;
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
