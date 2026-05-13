import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OjasMarketingGuidePage } from "@/components/v2/marketing/OjasMarketingGuidePage";
import {
  getMarketingGuide,
  listMarketingGuideSlugs,
  type MarketingGuideSlug,
} from "@/lib/marketing/siteCopy";

export const dynamic = "force-static";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return listMarketingGuideSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!listMarketingGuideSlugs().includes(slug as MarketingGuideSlug)) {
    return {};
  }
  const guide = getMarketingGuide(slug as MarketingGuideSlug);
  return {
    title: guide.title,
    description: guide.description,
  };
}

export default async function MarketingGuideRoute({ params }: PageProps) {
  const { slug } = await params;
  if (!listMarketingGuideSlugs().includes(slug as MarketingGuideSlug)) {
    notFound();
  }
  return <OjasMarketingGuidePage slug={slug as MarketingGuideSlug} />;
}
