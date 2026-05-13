"use client";

import Link from "next/link";
import { Activity } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SignOutButton } from "@/components/AuthBar";

type Props = {
  signInHref?: string;
};

export function OjasMarketingHeader({ signInHref = "/#sign-in" }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200/90 bg-white/85 px-4 py-3 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/90 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 shadow-md shadow-emerald-500/20 ring-2 ring-emerald-500/10">
            <Activity className="h-4 w-4 text-white" strokeWidth={2.5} aria-hidden />
          </span>
          <span className="hidden sm:inline">Ojas Health</span>
        </Link>
        <div className="flex min-w-0 flex-1 flex-col items-end gap-2 sm:max-w-none">
          <p className="text-right text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
            <span className="text-zinc-400 dark:text-zinc-500">By </span>
            <a
              href="https://vnar.github.io/viharnar/"
              className="font-medium text-zinc-700 underline underline-offset-2 transition-colors hover:text-emerald-700 dark:text-zinc-300 dark:hover:text-emerald-400"
              target="_blank"
              rel="noopener noreferrer"
            >
              Vihar Nar
            </a>
            <span className="mx-1 text-zinc-400 dark:text-zinc-600" aria-hidden>
              ·
            </span>
            <a
              href="https://www.linkedin.com/in/viharnar/"
              className="font-medium text-zinc-700 underline underline-offset-2 transition-colors hover:text-emerald-700 dark:text-zinc-300 dark:hover:text-emerald-400"
              target="_blank"
              rel="noopener noreferrer"
            >
              LinkedIn
            </a>
          </p>
          <nav className="flex flex-wrap items-center justify-end gap-1 text-[11px] font-medium sm:gap-2 sm:text-xs">
            <Link
              href="/#how-it-works"
              className="rounded-lg px-2 py-1.5 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              How it works
            </Link>
            <Link
              href="/#features"
              className="rounded-lg px-2 py-1.5 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              Product
            </Link>
            <Link
              href="/#guides"
              className="rounded-lg px-2 py-1.5 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              Guides
            </Link>
            <Link
              href="/#pricing"
              className="rounded-lg px-2 py-1.5 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              Free vs Pro
            </Link>
            <Link
              href="/account/billing"
              className="rounded-lg px-2 py-1.5 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              Plans
            </Link>
            <Link
              href={signInHref}
              className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-white shadow-sm transition hover:bg-emerald-500 sm:px-3"
            >
              Sign in
            </Link>
            <ThemeToggle />
            <SignOutButton />
          </nav>
        </div>
      </div>
    </header>
  );
}
