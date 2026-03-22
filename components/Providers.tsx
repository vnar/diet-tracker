"use client";

import { SessionProvider } from "next-auth/react";
import { HealthBootstrap } from "@/components/HealthBootstrap";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <HealthBootstrap>{children}</HealthBootstrap>
    </SessionProvider>
  );
}
