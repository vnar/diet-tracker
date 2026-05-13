import Link from "next/link";
import { OjasMarketingHeader } from "@/components/v2/marketing/OjasMarketingHeader";
import { getMarketingGuide, type MarketingGuideSlug } from "@/lib/marketing/siteCopy";

type Props = {
  slug: MarketingGuideSlug;
};

export function OjasMarketingGuidePage({ slug }: Props) {
  const guide = getMarketingGuide(slug);

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.12),transparent),radial-gradient(ellipse_60%_40%_at_100%_0%,rgba(139,92,246,0.08),transparent)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.15),transparent),radial-gradient(ellipse_60%_40%_at_100%_0%,rgba(139,92,246,0.12),transparent)]"
      />
      <OjasMarketingHeader />
      <article className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
          {guide.eyebrow}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
          {guide.title}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-400">{guide.intro}</p>
        <div className="mt-10 space-y-8">
          {guide.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
        <div className="mt-12 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-6">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Ready to try it?</p>
          <p className="mt-2 text-sm text-emerald-950/80 dark:text-emerald-100/80">
            Sign in on the home page and log your first day—weight, a meal photo, or both.
          </p>
          <Link
            href="/#sign-in"
            className="mt-4 inline-flex rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            {guide.ctaLabel}
          </Link>
        </div>
        <p className="mt-8 text-center text-xs text-zinc-500">
          <Link href="/" className="underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300">
            Back to Ojas Health home
          </Link>
        </p>
      </article>
    </main>
  );
}
