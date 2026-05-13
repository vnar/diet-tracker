export type MarketingGuideSlug =
  | "photo-meal-calorie-log"
  | "simple-weight-trend-log"
  | "family-weight-log";

export type MarketingGuide = {
  slug: MarketingGuideSlug;
  path: `/guides/${MarketingGuideSlug}`;
  title: string;
  description: string;
  eyebrow: string;
  intro: string;
  sections: { heading: string; paragraphs: string[] }[];
  ctaLabel: string;
};

export const MARKETING_SITE_URL = "https://ojas-health.com";

export const MARKETING_DEFAULT_METADATA = {
  title: "Ojas Health — morning weigh-in & photo meal tracking",
  description:
    "Log morning weight, snap meals for calorie estimates, and see your trend in one calm dashboard. Free to start; your history stays yours.",
  openGraphTitle: "Ojas Health — calm weight & meal tracking",
  openGraphDescription:
    "Morning weigh-in, photo meal estimates, and a clear trend line—without noisy calorie databases.",
} as const;

export const MARKETING_HOME = {
  badge: "Free to start · full access while we grow",
  headline: "Morning weigh-in + photo meal estimates in one calm dashboard.",
  headlineAccent: "See the trend, not the noise.",
  subhead:
    "Log weight in seconds, snap or say what you ate, adjust the estimate, and save your day. Built for people who want consistency—not another spreadsheet.",
  primaryCta: "Log your first day",
  secondaryCta: "See how it works",
  howItWorksTitle: "How it works",
  howItWorksSubtitle: "Three steps from open to saved",
  howItWorksSteps: [
    {
      step: "1",
      title: "Sign in & log weight",
      body: "Add a morning weigh-in. Ojas shows direction on a chart instead of daily drama.",
    },
    {
      step: "2",
      title: "Snap or say a meal",
      body: "Use a photo or voice check-in, review the estimate, and fix anything that looks off before you save.",
    },
    {
      step: "3",
      title: "Return tomorrow",
      body: "History, streaks, and weekly context reward the second log—not a perfect first week.",
    },
  ],
  trustTitle: "Built for trust",
  trustBullets: [
    "Your saved weights, meals, and photos stay yours—export and history are part of the core product.",
    "AI meal and coaching copy are estimates and tone only—not medical advice.",
    "During early access, advanced shortcuts stay open on Free while we learn what helps people stick.",
  ],
  guidesTitle: "Guides",
  guidesSubtitle: "Clear workflows for the habits we optimize first",
} as const;

export const MARKETING_GUIDES: readonly MarketingGuide[] = [
  {
    slug: "photo-meal-calorie-log",
    path: "/guides/photo-meal-calorie-log",
    eyebrow: "Meal logging",
    title: "Photo meal calorie log without typing every ingredient",
    description:
      "Snap a meal, review an AI calorie and protein estimate, edit if needed, and save to your day log on Ojas Health.",
    intro:
      "Most calorie apps punish you with search boxes. Ojas is built for a faster loop: photo → estimate → confirm → saved on your timeline.",
    sections: [
      {
        heading: "When photo logging fits",
        paragraphs: [
          "Photo estimates work best for composed plates—bowls, takeout, leftovers—where guessing from memory is worse than a quick model pass.",
          "You stay in control: adjust calories or protein before anything is stored.",
        ],
      },
      {
        heading: "How to log a meal photo on Ojas",
        paragraphs: [
          "Open your dashboard, choose today’s log, and use the camera control on calories or meals.",
          "Upload a clear photo (JPEG, PNG, or WebP). Review the suggested items and totals, then save to your day.",
        ],
      },
      {
        heading: "What to expect",
        paragraphs: [
          "Estimates are coaching shortcuts, not lab accuracy. Use them to stay honest between weigh-ins, not to diagnose or treat.",
          "Pair photo meals with a morning weight log so you can see whether the trend matches your week.",
        ],
      },
    ],
    ctaLabel: "Try photo meal logging",
  },
  {
    slug: "simple-weight-trend-log",
    path: "/guides/simple-weight-trend-log",
    eyebrow: "Weight tracking",
    title: "Simple weight trend log for a calmer morning ritual",
    description:
      "Log morning weight in seconds, view history and charts, and focus on direction instead of daily noise on Ojas Health.",
    intro:
      "A single morning weigh-in, repeated, beats perfect logging that stops after a week. Ojas keeps the ritual light and the chart honest.",
    sections: [
      {
        heading: "Why one weigh-in time matters",
        paragraphs: [
          "Morning weight after a similar routine reduces false spikes from salt, travel, or late meals.",
          "Ojas charts the line so you notice drift over weeks, not panic over one pound.",
        ],
      },
      {
        heading: "What you get on the dashboard",
        paragraphs: [
          "Today’s log, past days, and trend views tied to the entries you actually saved.",
          "Optional progress photos sit beside the numbers when you want the full picture.",
        ],
      },
      {
        heading: "Make week two easier than week one",
        paragraphs: [
          "Streaks and weekly summaries reward showing up again—not hitting a perfect target on day one.",
          "Add a meal photo or voice note when you are ready; weight alone is a valid starting point.",
        ],
      },
    ],
    ctaLabel: "Start logging weight",
  },
  {
    slug: "family-weight-log",
    path: "/guides/family-weight-log",
    eyebrow: "Households",
    title: "Family weight log without another shared spreadsheet",
    description:
      "Switch users, keep separate histories, and share one calm dashboard for household weight and meal tracking on Ojas Health.",
    intro:
      "Couples and families often share goals but not the same log. Ojas supports multiple users so everyone keeps their own timeline.",
    sections: [
      {
        heading: "Separate logs, one product",
        paragraphs: [
          "Each person signs in with their own account. Weights, meals, and photos stay tied to that user.",
          "Switching users is faster than maintaining a shared sheet with fragile formulas.",
        ],
      },
      {
        heading: "Share progress without oversharing",
        paragraphs: [
          "Copy a plain-text week summary for a coach or partner when you want accountability—not automatic public feeds.",
          "You choose what leaves the app; nothing is posted for you.",
        ],
      },
      {
        heading: "Good defaults for households",
        paragraphs: [
          "Start with morning weigh-ins for each person, then add meal photos on busy days.",
          "Use the same calm dashboard so the habit feels shared even when the numbers are private.",
        ],
      },
    ],
    ctaLabel: "Create household accounts",
  },
] as const;

export function getMarketingGuide(slug: MarketingGuideSlug): MarketingGuide {
  const guide = MARKETING_GUIDES.find((g) => g.slug === slug);
  if (!guide) {
    throw new Error(`Unknown marketing guide: ${slug}`);
  }
  return guide;
}

export function listMarketingGuideSlugs(): MarketingGuideSlug[] {
  return MARKETING_GUIDES.map((g) => g.slug);
}
