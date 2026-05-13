"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  isMealPlanTeaserEnabled,
  isProteinHintStripEnabled,
  isProValueStripEnabled,
  isReferralInviteEnabled,
  isSleepWeekCardEnabled,
  isYearReviewPageEnabled,
} from "@/lib/featureFlags";
import { RoadmapInfoCard } from "@/components/v2/roadmap/RoadmapInfoCard";
import { useHealthStore } from "@/lib/store";
import { useClientTodayKey } from "@/hooks/useClientTodayKey";
import { getEntryForDate } from "@/lib/calculations";
import { averageSleepLastDays } from "@/lib/sleep/sleepWeekSummary";
import { suggestProteinHint } from "@/lib/nutrition/proteinHint";
import { track } from "@/lib/analytics";

const fadeInUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 },
};

const MEAL_IDEAS = [
  "Greek yogurt bowl + berries + hemp seeds (~30g protein)",
  "Rotisserie chicken + microwaved frozen veg + olive oil",
  "Tofu stir-fry with snap peas over quick-cook brown rice",
];

export function NutritionEngagementTeasers({ userId }: { userId: string }) {
  const entries = useHealthStore((s) => s.entries);
  const todayKey = useClientTodayKey();
  const todayEntry = todayKey ? getEntryForDate(entries, todayKey) : undefined;
  const proteinG = todayEntry?.protein;
  const proteinHint = suggestProteinHint(proteinG);
  const sleepAvg =
    todayKey && isSleepWeekCardEnabled(userId) ? averageSleepLastDays(entries, todayKey, 7) : null;

  const referralHref = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://ojas-health.com";
    return (
      "mailto:?subject=" +
      encodeURIComponent("Join me on Ojas Health") +
      "&body=" +
      encodeURIComponent(`I've been using Ojas Health for habits and weight — here's the link: ${origin}`)
    );
  }, []);

  return (
    <>
      {isMealPlanTeaserEnabled(userId) ? (
        <motion.section {...fadeInUp} className="h-full min-h-0" aria-label="Meal ideas">
          <RoadmapInfoCard eyebrow="Meal planning" title="High-protein anchors (ideas)">
            <p>Rule-based ideas you can adapt — not personalized medical nutrition.</p>
            <ul className="list-inside list-disc space-y-1 text-zinc-300">
              {MEAL_IDEAS.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <button
              type="button"
              className="text-xs font-semibold text-emerald-400 underline-offset-2 hover:underline"
              onClick={() => track("roadmap_meal_plan_teaser_viewed", {})}
            >
              Log one as today&apos;s meal
            </button>
          </RoadmapInfoCard>
        </motion.section>
      ) : null}

      {isProteinHintStripEnabled(userId) && proteinHint ? (
        <motion.section {...fadeInUp} className="h-full min-h-0" aria-label="Protein hint">
          <div className="h-full rounded-lg border border-sky-600/30 bg-sky-950/30 px-2.5 py-2 text-[11px] text-sky-100 shadow-sm">
            <p className="font-medium text-sky-50">Protein check-in</p>
            <p className="mt-1 text-sky-100/90">{proteinHint}</p>
          </div>
        </motion.section>
      ) : null}

      {isSleepWeekCardEnabled(userId) && sleepAvg != null ? (
        <motion.section {...fadeInUp} className="h-full min-h-0" aria-label="Sleep average">
          <RoadmapInfoCard eyebrow="Sleep" title="7-night average (logged hours)">
            <p className="text-xl font-bold tabular-nums text-zinc-100">{sleepAvg.toFixed(1)} h / night</p>
            <p>Based on sleep hours you saved on each day. Wearable sync will improve this later.</p>
          </RoadmapInfoCard>
        </motion.section>
      ) : null}

      {isProValueStripEnabled(userId) ? (
        <motion.section {...fadeInUp} className="h-full min-h-0" aria-label="Pro value">
          <RoadmapInfoCard eyebrow="Ojas Pro" title="Go deeper on coaching & limits">
            <ul className="list-inside list-disc space-y-1 text-zinc-300">
              <li>Natural-language meal logging and photo estimates where enabled</li>
              <li>Priority access to new AI surfaces as they ship</li>
            </ul>
            <Link
              href="/account/billing"
              className="inline-block text-xs font-semibold text-emerald-400 underline-offset-2 hover:underline"
              onClick={() => track("roadmap_pro_billing_clicked", {})}
            >
              View billing & plans
            </Link>
          </RoadmapInfoCard>
        </motion.section>
      ) : null}

      {isReferralInviteEnabled(userId) ? (
        <motion.section {...fadeInUp} className="h-full min-h-0" aria-label="Refer a friend">
          <RoadmapInfoCard eyebrow="Growth" title="Invite someone you trust">
            <p>Word-of-mouth keeps quality high. Send a pre-filled email — no referral codes yet.</p>
            <a
              href={referralHref}
              className="inline-block text-xs font-semibold text-emerald-400 underline-offset-2 hover:underline"
              onClick={() => track("roadmap_referral_clicked", {})}
            >
              Open mail with invite text
            </a>
          </RoadmapInfoCard>
        </motion.section>
      ) : null}

      {isYearReviewPageEnabled(userId) ? (
        <motion.section {...fadeInUp} className="h-full min-h-0" aria-label="Year in review">
          <RoadmapInfoCard eyebrow="Milestones" title="Year in review (preview)">
            <p>See streaks, weight delta, and habit consistency in one place — expanding through 2026.</p>
            <Link
              href="/year-review"
              className="inline-block text-xs font-semibold text-emerald-400 underline-offset-2 hover:underline"
              onClick={() => track("roadmap_year_review_nav", {})}
            >
              Open year review page
            </Link>
          </RoadmapInfoCard>
        </motion.section>
      ) : null}
    </>
  );
}
