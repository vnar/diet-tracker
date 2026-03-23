"use client";

import { CognitoAuthProvider } from "@/components/CognitoAuthProvider";
import { HealthBootstrap } from "@/components/HealthBootstrap";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CognitoAuthProvider>
      <HealthBootstrap>{children}</HealthBootstrap>
    </CognitoAuthProvider>
  );
}
