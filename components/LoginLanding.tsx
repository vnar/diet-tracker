"use client";

import { LoginForm } from "@/components/LoginForm";
import { SignOutButton } from "@/components/AuthBar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Activity } from "lucide-react";

export function LoginLanding() {
  return (
    <main className="relative min-h-screen bg-gradient-to-b from-zinc-100 via-white to-zinc-100 text-zinc-900 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900 dark:text-zinc-100">
      <header className="sticky top-0 z-30 flex items-center justify-end gap-2 border-b border-zinc-200/90 bg-white/80 px-4 py-3 backdrop-blur-md sm:px-6 dark:border-zinc-800/80 dark:bg-zinc-950/85">
        <ThemeToggle />
        <SignOutButton />
      </header>

      <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-lg flex-col justify-center px-4 py-12 sm:px-6">
        <div className="w-full">
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 shadow-lg shadow-emerald-500/25 ring-4 ring-emerald-500/10 dark:shadow-emerald-500/20">
              <Activity size={22} className="text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Ojas-Health</h1>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Sign in to sync weight, meals, and progress photos.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-xl shadow-zinc-900/5 ring-1 ring-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-900/80 dark:shadow-black/40 dark:ring-white/5 sm:p-7">
            <LoginForm />
          </div>

          <p className="mt-6 text-center text-[11px] text-zinc-500 dark:text-zinc-600">
            By{" "}
            <a
              href="https://www.linkedin.com/in/viharnar/"
              className="font-medium text-zinc-700 underline underline-offset-2 transition-colors hover:text-emerald-700 dark:text-zinc-400 dark:hover:text-zinc-300"
              target="_blank"
              rel="noopener noreferrer"
            >
              Vihar Nar
            </a>
          </p>
        </div>
      </div>
      <div aria-hidden className="h-8 sm:h-10" />
    </main>
  );
}
