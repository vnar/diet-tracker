import type { Metadata } from "next";
import { Suspense } from "react";
import { SharedTimelapsePageClient } from "@/components/v2/photos/SharedTimelapsePageClient";
import { MARKETING_SITE_URL } from "@/lib/marketing/siteCopy";

export const metadata: Metadata = {
  title: "Progress journey",
  description: "Watch a progress photo timelapse on Ojas Health.",
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    url: `${MARKETING_SITE_URL}/share`,
    title: "Progress journey · Ojas Health",
    description: "A timelapse of progress photos — morning weigh-ins and calm tracking.",
    siteName: "Ojas Health",
  },
};

export default function SharedTimelapseRoute() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center bg-black text-sm text-zinc-400">
          Loading progress timelapse…
        </div>
      }
    >
      <SharedTimelapsePageClient />
    </Suspense>
  );
}
