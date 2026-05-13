import { MARKETING_DEFAULT_METADATA, MARKETING_SITE_URL } from "@/lib/marketing/siteCopy";

export function HomeLoadingScreen() {
  return (
    <main
      id="app-main"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-3 bg-zinc-50 px-4 text-center dark:bg-zinc-950"
    >
      <p className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        {MARKETING_DEFAULT_METADATA.openGraphTitle}
      </p>
      <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
        {MARKETING_DEFAULT_METADATA.openGraphDescription}
      </p>
      <p className="text-xs text-zinc-500" aria-live="polite">
        Loading your dashboard…
      </p>
    </main>
  );
}
