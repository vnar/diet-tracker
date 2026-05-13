import type { MetadataRoute } from "next";
import { MARKETING_GUIDES, MARKETING_SITE_URL } from "@/lib/marketing/siteCopy";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: MARKETING_SITE_URL,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...MARKETING_GUIDES.map((guide) => ({
      url: `${MARKETING_SITE_URL}${guide.path}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
