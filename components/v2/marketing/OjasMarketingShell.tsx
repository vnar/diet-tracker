"use client";

import Link from "next/link";
import {
  Activity,
  Camera,
  LineChart,
  Mic,
  Scale,
  Sparkles,
  Utensils,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SignOutButton } from "@/components/AuthBar";
import { BILLING_PLANS } from "@/lib/billing/plans";

type Props = {
  children: React.ReactNode;
};

export function OjasMarketingShell({ children }: Props) {
  const proPrice = BILLING_PLANS.pro_monthly.price;

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.12),transparent),radial-gradient(ellipse_60%_40%_at_100%_0%,rgba(139,92,246,0.08),transparent)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.15),transparent),radial-gradient(ellipse_60%_40%_at_100%_0%,rgba(139,92,246,0.12),transparent)]"
      />

      <header className="sticky top-0 z-30 border-b border-zinc-200/90 bg-white/85 px-4 py-3 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/90 sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 shadow-md shadow-emerald-500/20 ring-2 ring-emerald-500/10">
              <Activity className="h-4 w-4 text-white" strokeWidth={2.5} aria-hidden />
            </span>
            <span className="hidden sm:inline">Ojas-Health</span>
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
              <a
                href="#features"
                className="rounded-lg px-2 py-1.5 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                Product
              </a>
              <a
                href="#pricing"
                className="rounded-lg px-2 py-1.5 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                Free vs Pro
              </a>
              <Link
                href="/account/billing"
                className="rounded-lg px-2 py-1.5 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                Plans
              </Link>
              <a
                href="#sign-in"
                className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-white shadow-sm transition hover:bg-emerald-500 sm:px-3"
              >
                Sign in
              </a>
              <ThemeToggle />
              <SignOutButton />
            </nav>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
        <section className="scroll-mt-28 sm:scroll-mt-32">
          <div className="overflow-hidden rounded-3xl border border-zinc-200/90 bg-gradient-to-br from-white via-zinc-50 to-emerald-50/30 shadow-2xl shadow-zinc-900/[0.08] ring-1 ring-zinc-900/[0.04] dark:border-zinc-700/90 dark:from-zinc-950 dark:via-zinc-950 dark:to-emerald-950/20 dark:shadow-black/50 dark:ring-white/10">
            <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-12 lg:items-center lg:gap-0 lg:p-0">
              <div className="text-center lg:col-span-7 lg:p-10 lg:pr-8 lg:text-left xl:p-12">
                <p className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 lg:mx-0">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  Freemium · upgrade when you want depth
                </p>
                <h1 className="mx-auto max-w-3xl text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl md:text-[2.65rem] md:leading-[1.12] dark:text-zinc-50 lg:mx-0 lg:max-w-none">
                  Calm tracking for weight, meals, and progress—
                  <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent dark:from-emerald-400 dark:to-teal-400">
                    {" "}
                    with AI that respects your data
                  </span>
                </h1>
                <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400 lg:mx-0 lg:max-w-xl">
                  Start free with logging and history.{" "}
                  <strong className="font-semibold text-zinc-800 dark:text-zinc-200">Pro</strong> adds personalized
                  coaching, smarter meal shortcuts, and generous voice check-ins—like unlocking a sharper layer on top of
                  what you already built, not a penalty for staying free.
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                  <a
                    href="#sign-in"
                    className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-500"
                  >
                    Get started free
                  </a>
                  <a
                    href="#pricing"
                    className="inline-flex items-center justify-center rounded-xl border border-zinc-300/90 bg-white/90 px-5 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-white dark:border-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Compare plans
                  </a>
                </div>
              </div>

              <div
                id="sign-in"
                className="flex flex-col justify-center border-t border-zinc-200/80 bg-zinc-50/60 p-6 sm:p-8 dark:border-zinc-700/80 dark:bg-zinc-900/40 lg:col-span-5 lg:border-l lg:border-t-0 lg:p-10 lg:pl-8 xl:p-12"
              >
                <h2 className="text-center text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 lg:text-left">
                  Sign in or create an account
                </h2>
                <p className="mt-1 text-center text-[11px] leading-snug text-zinc-500 dark:text-zinc-400 lg:text-left">
                  AWS Cognito · free core logging included
                </p>
                <div className="mt-4">{children}</div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mt-20 scroll-mt-24">
          <h2 className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-500">
            What you get
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            One dashboard for the habits that move the needle
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              {
                icon: Scale,
                title: "Weight & trends",
                body: "Morning and night weights, history, and charts so you see direction—not noise.",
                accent: "from-sky-500/15 to-transparent",
              },
              {
                icon: Utensils,
                title: "Meals & energy",
                body: "Day log, meal library, and activity balance so calories and steps stay honest.",
                accent: "from-amber-500/15 to-transparent",
              },
              {
                icon: Camera,
                title: "Progress photos",
                body: "Progress shots alongside your numbers for the full picture over time.",
                accent: "from-violet-500/15 to-transparent",
              },
            ].map(({ icon: Icon, title, body, accent }) => (
              <div
                key={title}
                className={`group relative overflow-hidden rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-sm ring-1 ring-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-900/50 dark:ring-white/5`}
              >
                <div
                  className={`pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br ${accent} opacity-80`}
                  aria-hidden
                />
                <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
                  <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
                </div>
                <h3 className="relative mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
                <p className="relative mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{body}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {[
              { icon: Sparkles, text: "Personalized coaching nudges from your own logs (Pro)" },
              { icon: Mic, text: "Voice check-in to fill your day log faster (soft free cap when Pro billing is on)" },
              { icon: LineChart, text: "Trajectory & weekly AI summaries (rolling out on Pro)" },
            ].map(({ icon: Icon, text }) => (
              <div
                key={text}
                className="flex items-start gap-3 rounded-xl border border-zinc-200/80 bg-white/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                <p className="text-xs leading-snug text-zinc-600 dark:text-zinc-400">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="mt-24 scroll-mt-24">
          <h2 className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Pricing</h2>
          <p className="mx-auto mt-2 max-w-lg text-center text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Free to start. Pro when you want the full intelligence layer.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
              <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Free</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">$0</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Core logging, history, and charts.</p>
              <ul className="mt-6 space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
                <li className="flex gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400">✓</span> Weight, day log, review & history
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400">✓</span> Progress photos alongside entries
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400">✓</span> Your data stays yours—no lock-out of what you already saved
                </li>
                <li className="flex gap-2 text-zinc-500">
                  <span>○</span> Pro AI meals, voice, and coaching when monetization is enabled
                </li>
              </ul>
            </div>
            <div className="relative overflow-hidden rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-950/40 via-zinc-900 to-zinc-950 p-6 text-zinc-100 shadow-xl ring-1 ring-violet-500/20 dark:from-violet-950/50 dark:via-zinc-950 dark:to-zinc-950">
              <div
                className="pointer-events-none absolute -right-12 top-0 h-40 w-40 rounded-full bg-emerald-500/20 blur-2xl"
                aria-hidden
              />
              <p className="relative text-sm font-semibold text-violet-200">Pro</p>
              <p className="relative mt-1 text-3xl font-bold tabular-nums text-white">
                {proPrice}
                <span className="text-base font-medium text-zinc-400">/mo</span>
              </p>
              <p className="relative mt-1 text-sm text-zinc-300">
                Cancel anytime. Billed securely via Stripe when your deployment is configured.
              </p>
              <ul className="relative mt-6 space-y-3 text-sm text-zinc-300">
                <li className="flex gap-2">
                  <span className="text-emerald-400">✓</span> Everything in Free
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400">✓</span> Personalized coaching nudges from your logs
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400">✓</span> Natural-language & photo meal flows at full convenience
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400">✓</span> Generous voice parsing & roadmap features (integrations, exports)
                </li>
              </ul>
              <div className="relative mt-6 flex flex-wrap gap-2">
                <Link
                  href="/account/billing"
                  className="inline-flex flex-1 items-center justify-center rounded-xl bg-emerald-500 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-emerald-400 sm:flex-none"
                >
                  Open billing
                </Link>
                <a
                  href="#sign-in"
                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-zinc-500/50 px-4 py-2.5 text-center text-sm font-semibold text-white/90 transition hover:bg-white/10 sm:flex-none"
                >
                  Sign in first
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
