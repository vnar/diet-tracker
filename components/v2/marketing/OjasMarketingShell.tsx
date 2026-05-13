"use client";

import Link from "next/link";
import {
  Camera,
  LineChart,
  Mic,
  Scale,
  Sparkles,
  Utensils,
} from "lucide-react";
import { OjasMarketingHeader } from "@/components/v2/marketing/OjasMarketingHeader";
import { BILLING_PLANS } from "@/lib/billing/plans";
import { MARKETING_GUIDES, MARKETING_HOME } from "@/lib/marketing/siteCopy";

type Props = {
  children: React.ReactNode;
};

export function OjasMarketingShell({ children }: Props) {
  const proPrice = BILLING_PLANS.pro_monthly.price;
  const home = MARKETING_HOME;

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.12),transparent),radial-gradient(ellipse_60%_40%_at_100%_0%,rgba(139,92,246,0.08),transparent)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.15),transparent),radial-gradient(ellipse_60%_40%_at_100%_0%,rgba(139,92,246,0.12),transparent)]"
      />

      <OjasMarketingHeader />

      <div className="relative mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
        <section className="scroll-mt-28 sm:scroll-mt-32">
          <div className="overflow-hidden rounded-3xl border border-zinc-200/90 bg-gradient-to-br from-white via-zinc-50 to-emerald-50/30 shadow-2xl shadow-zinc-900/[0.08] ring-1 ring-zinc-900/[0.04] dark:border-zinc-700/90 dark:from-zinc-950 dark:via-zinc-950 dark:to-emerald-950/20 dark:shadow-black/50 dark:ring-white/10">
            <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-12 lg:items-center lg:gap-0 lg:p-0">
              <div className="text-center lg:col-span-7 lg:p-10 lg:pr-8 lg:text-left xl:p-12">
                <p className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 lg:mx-0">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  {home.badge}
                </p>
                <h1 className="mx-auto max-w-3xl text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl md:text-[2.65rem] md:leading-[1.12] dark:text-zinc-50 lg:mx-0 lg:max-w-none">
                  {home.headline}{" "}
                  <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent dark:from-emerald-400 dark:to-teal-400">
                    {home.headlineAccent}
                  </span>
                </h1>
                <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400 lg:mx-0 lg:max-w-xl">
                  {home.subhead}
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                  <a
                    href="#sign-in"
                    className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-500"
                  >
                    {home.primaryCta}
                  </a>
                  <a
                    href="#how-it-works"
                    className="inline-flex items-center justify-center rounded-xl border border-zinc-300/90 bg-white/90 px-5 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-white dark:border-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  >
                    {home.secondaryCta}
                  </a>
                </div>
              </div>

              <div className="flex flex-col justify-center lg:col-span-5 lg:py-4 lg:pl-2 lg:pr-5 xl:py-6 xl:pl-3 xl:pr-7">
                <div
                  id="sign-in"
                  className="mx-0 mt-8 flex flex-col justify-center rounded-2xl border-2 border-white bg-zinc-100/95 p-6 shadow-md shadow-zinc-900/10 dark:bg-zinc-900/55 dark:shadow-black/30 sm:p-8 lg:mt-0 lg:p-8 xl:p-10"
                >
                  <h2 className="text-center text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 lg:text-left">
                    Sign in or create an account
                  </h2>
                  <p className="mt-1 text-center text-[11px] leading-snug text-zinc-500 dark:text-zinc-400 lg:text-left">
                    Free core logging · photo meals & voice while we grow
                  </p>
                  <div className="mt-4">{children}</div>
                </div>
              </div>
            </div>
          </div>
        </section>


        <section id="how-it-works" className="mt-20 scroll-mt-24">
          <h2 className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-500">
            {home.howItWorksTitle}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {home.howItWorksSubtitle}
          </p>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {home.howItWorksSteps.map((step) => (
              <li
                key={step.step}
                className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Step {step.step}
                </p>
                <h3 className="mt-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{step.body}</p>
              </li>
            ))}
          </ol>
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
                title: "Morning weigh-in",
                body: "Log weight in seconds and read the trend line—not daily drama.",
                accent: "from-sky-500/15 to-transparent",
              },
              {
                icon: Camera,
                title: "Photo meal estimates",
                body: "Snap a plate, review calories and protein, fix anything off, then save.",
                accent: "from-violet-500/15 to-transparent",
              },
              {
                icon: Utensils,
                title: "Meals & energy",
                body: "Day log, meal library, and activity balance keep the week honest.",
                accent: "from-amber-500/15 to-transparent",
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
              { icon: Mic, text: "Voice check-in to fill your day log faster" },
              { icon: Sparkles, text: "Coaching nudges from your own logs (deeper on Pro later)" },
              { icon: LineChart, text: "Trajectory & weekly summaries on the roadmap" },
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


        <section id="guides" className="mt-20 scroll-mt-24">
          <h2 className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            {home.guidesTitle}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-center text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {home.guidesSubtitle}
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {MARKETING_GUIDES.map((guide) => (
              <Link
                key={guide.slug}
                href={guide.path}
                className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm transition hover:border-emerald-500/30 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/50"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  {guide.eyebrow}
                </p>
                <h3 className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{guide.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{guide.description}</p>
              </Link>
            ))}
          </div>
        </section>

        <section id="trust" className="mt-20 scroll-mt-24">
          <h2 className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            {home.trustTitle}
          </h2>
          <ul className="mx-auto mt-6 max-w-2xl space-y-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {home.trustBullets.map((bullet) => (
              <li key={bullet} className="flex gap-2 rounded-xl border border-zinc-200/80 bg-white/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                <span className="text-emerald-600 dark:text-emerald-400" aria-hidden>
                  ✓
                </span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </section>

        <section id="pricing" className="mt-24 scroll-mt-24">
          <h2 className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Pricing</h2>
          <p className="mx-auto mt-2 max-w-lg text-center text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Free to start. Pro later when you want the full intelligence layer.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
              <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Free</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">$0</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Core logging, history, charts, and early-access shortcuts.</p>
              <ul className="mt-6 space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
                <li className="flex gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400">✓</span> Morning weigh-in, day log, review & history
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400">✓</span> Photo meal estimates & voice check-ins while monetization is off
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400">✓</span> Progress photos alongside entries
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400">✓</span> Your data stays yours—no lock-out of what you already saved
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
                Optional later—cancel anytime when billing is enabled on your deployment.
              </p>
              <ul className="relative mt-6 space-y-3 text-sm text-zinc-300">
                <li className="flex gap-2">
                  <span className="text-emerald-400">✓</span> Everything in Free
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400">✓</span> Deeper coaching nudges from your logs
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400">✓</span> Priority on new AI surfaces as they ship
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400">✓</span> Integrations & exports on the roadmap
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
