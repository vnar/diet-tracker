import type { MetadataRoute } from "next";
import { MARKETING_SITE_URL } from "@/lib/marketing/siteCopy";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${MARKETING_SITE_URL}/sitemap.xml`,
  };
}
