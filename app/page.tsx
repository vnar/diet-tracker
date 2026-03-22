import { auth } from "@/auth";
import { LoginLanding } from "@/components/LoginLanding";
import { HealthDashboard } from "@/components/HealthDashboard";

/** Server decides first paint: login vs dashboard (no client session loading flash). */
export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();

  if (!session?.user?.id) {
    return <LoginLanding />;
  }

  return <HealthDashboard />;
}
