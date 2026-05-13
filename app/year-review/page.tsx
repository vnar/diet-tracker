"use client";

import Link from "next/link";

export default function YearReviewPage() {
  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100 sm:px-8">
      <Link href="/" className="text-sm font-medium text-emerald-400 hover:text-emerald-300">
        ← Back to dashboard
      </Link>
      <h1 className="mt-8 text-3xl font-bold tracking-tight">Year in review</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">
        A dedicated recap of weight trend, habits, and streaks is rolling out. When enabled for your account,
        this page will summarize your logged year — still estimate-only, not medical advice.
      </p>
      <ul className="mt-8 max-w-lg list-inside list-disc space-y-2 text-sm text-zinc-300">
        <li>Weight delta vs your goal arc</li>
        <li>Consistency of sleep, steps, and protein where logged</li>
        <li>Shareable milestone card (optional)</li>
      </ul>
    </div>
  );
}
