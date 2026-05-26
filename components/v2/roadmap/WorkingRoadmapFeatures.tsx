"use client";

import { motion } from "framer-motion";
import {
  isDailyReadinessScoreEnabled,
  isAiTrustFooterEnabled,
  isMedicationWellnessCardEnabled,
  isWeightLogStreakEnabled,
} from "@/lib/featureFlags";
import { WeightStreakCard } from "@/components/v2/streaks/WeightStreakCard";
import { NutritionEngagementTeasers } from "@/components/v2/roadmap/NutritionEngagementTeasers";
import { MedicationChecklistCard } from "@/components/v2/roadmap/MedicationChecklistCard";
import { DailyReadinessCard } from "@/components/v2/recovery/DailyReadinessCard";

const fadeInUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25 },
};

export function WorkingRoadmapFeatures({ userId }: { userId: string }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {isWeightLogStreakEnabled(userId) ? (
        <motion.section {...fadeInUp} className="h-full min-h-0 sm:col-span-2" aria-label="Weight logging streak">
          <WeightStreakCard compact />
        </motion.section>
      ) : null}

      {isDailyReadinessScoreEnabled(userId) ? (
        <motion.section
          {...fadeInUp}
          className="h-full min-h-0 sm:col-span-2"
          aria-label="Daily readiness score"
        >
          <DailyReadinessCard />
        </motion.section>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:col-span-2 sm:grid-cols-2">
        <NutritionEngagementTeasers userId={userId} />
      </div>

      {isMedicationWellnessCardEnabled(userId) ? (
        <motion.section {...fadeInUp} className="h-full min-h-0" aria-label="Medication checklist">
          <MedicationChecklistCard />
        </motion.section>
      ) : null}

      {isAiTrustFooterEnabled(userId) ? (
        <motion.section
          {...fadeInUp}
          className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-2.5 py-2 text-[10px] leading-relaxed text-zinc-500 sm:col-span-2"
          aria-label="AI trust note"
        >
          <p>
            AI-assisted summaries elsewhere on the dashboard are estimates and coaching tone only — not medical
            advice. Always verify numbers and decisions with a qualified professional.
          </p>
        </motion.section>
      ) : null}
    </div>
  );
}
