"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Client redirect — `redirect()` is not compatible with static export. */
export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <div className="flex min-h-[30vh] items-center justify-center text-sm text-zinc-500 dark:text-slate-400">
      Redirecting…
    </div>
  );
}
