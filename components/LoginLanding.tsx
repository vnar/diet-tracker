"use client";

import { LoginForm } from "@/components/LoginForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Activity } from "lucide-react";

export function LoginLanding() {
  return (
    <main className="relative min-h-[calc(100vh-2.5rem)] bg-zinc-950">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-5xl flex-col">
        <div className="absolute right-5 top-6 sm:right-8">
          <ThemeToggle />
        </div>

        <section className="flex flex-1 items-center justify-center px-4 py-16">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex items-center justify-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500 shadow-lg shadow-emerald-500/20">
                <Activity size={16} className="text-white" strokeWidth={2.5} />
              </div>
              <span className="text-xl font-bold tracking-tight text-zinc-100">HealthOS</span>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
              <LoginForm />
            </div>

            <p className="mt-4 text-center text-[11px] text-zinc-600">
              By{" "}
              <a
                href="https://www.linkedin.com/in/viharnar/"
                className="text-zinc-500 underline underline-offset-2 transition-colors hover:text-zinc-300"
                target="_blank"
                rel="noopener noreferrer"
              >
                Vihar Nar
              </a>
            </p>
          </div>
        </section>
        {/* Footer is rendered globally by RootLayout */}
        <div aria-hidden className="h-10" />
        </div>
    </main>
  );
}
