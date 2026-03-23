"use client";

import { useCallback, useEffect, useState } from "react";
import { LoginForm } from "@/components/LoginForm";
import { ThemeToggle } from "@/components/ThemeToggle";

const awsServices = [
  "Amplify Hosting (WEB)",
  "Amazon Cognito",
  "API Gateway (HTTP API)",
  "AWS Lambda",
  "Amazon DynamoDB (Entries, Settings)",
  "Amazon S3 (Photos)",
];

export function LoginLanding() {
  const [healthState, setHealthState] = useState<"checking" | "online" | "offline">(
    "checking"
  );

  const runHealthCheck = useCallback(async () => {
    const apiUrl = process.env.NEXT_PUBLIC_AWS_API_URL;
    if (!apiUrl) {
      setHealthState("offline");
      return;
    }
    try {
      const base = apiUrl.replace(/\/+$/, "");
      const res = await fetch(`${base}/settings`, { method: "GET" });
      // 401/403 is expected when unauthenticated and still means backend is reachable.
      if (res.ok || res.status === 401 || res.status === 403) {
        setHealthState("online");
        return;
      }
      setHealthState("offline");
    } catch {
      setHealthState("offline");
    }
  }, []);

  useEffect(() => {
    void runHealthCheck();
    const id = window.setInterval(() => {
      void runHealthCheck();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [runHealthCheck]);

  return (
    <main className="relative mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-6xl gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[1fr_minmax(22rem,28rem)]">
      <div className="order-2 space-y-6 lg:order-1 lg:self-end">
        <section className="rounded-2xl border border-zinc-200/80 bg-white/50 p-5 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/40">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
            AWS Services
          </h2>
          <ul className="mt-3 space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">
            {awsServices.map((service) => (
              <li key={service}>- {service}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-zinc-200/80 bg-white/50 p-5 text-sm backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/40">
          <p className="font-semibold text-zinc-800 dark:text-zinc-100">Change Log</p>
          <p className="mt-2 text-zinc-600 dark:text-zinc-300">
            Build: Amplify static hosting pipeline
          </p>
          <p className="text-zinc-600 dark:text-zinc-300">Version: v1.0.0</p>
          <button
            type="button"
            onClick={() => void runHealthCheck()}
            className={`mt-3 inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 font-semibold text-white transition ${
              healthState === "online"
                ? "bg-emerald-600 hover:bg-emerald-500"
                : healthState === "checking"
                  ? "bg-emerald-500/80 hover:bg-emerald-500"
                  : "bg-rose-600 hover:bg-rose-500"
            }`}
          >
            {healthState === "online"
              ? "Health: Online"
              : healthState === "checking"
                ? "Health: Checking..."
                : "Health: Offline"}
          </button>
          <p className="mt-3 text-zinc-600 dark:text-zinc-300">
            Maintainer: Vihar Nar (
            <a
              href="https://www.linkedin.com/in/viharnar/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-emerald-600 underline underline-offset-2 transition hover:text-emerald-500 dark:text-emerald-400"
            >
              LinkedIn
            </a>
            )
          </p>
        </section>
      </div>

      <div className="order-1 flex min-h-[calc(100vh-8rem)] flex-col justify-center lg:order-2">
        <div className="absolute right-5 top-6 sm:right-8">
          <ThemeToggle />
        </div>
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-[-0.04em] text-zinc-900 dark:text-white sm:text-4xl">
            HealthOS
          </h1>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
