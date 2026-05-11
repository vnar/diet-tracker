"use client";

import { LoginForm } from "@/components/LoginForm";
import { OjasMarketingShell } from "@/components/v2/marketing/OjasMarketingShell";

export function LoginLanding() {
  return (
    <OjasMarketingShell>
      <LoginForm compact />
    </OjasMarketingShell>
  );
}
