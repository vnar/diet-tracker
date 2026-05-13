"use client";

import { motion } from "framer-motion";
import {
  isAiTrustFooterEnabled,
  isMedicationWellnessCardEnabled,
  isWeightLogStreakEnabled,
} from "@/lib/featureFlags";
import { WeightStreakCard } from "@/components/v2/streaks/WeightStreakCard";
import { NutritionEngagementTeasers } from "@/components/v2/roadmap/NutritionEngagementTeasers";
import { MedicationChecklistCard } from "@/components/v2/roadmap/MedicationChecklistCard";

const fadeInUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25 },
};

export function WorkingRoadmapFeatures({ userId }: { userId: string }) {
  return (
    <div className="space-y-4">
      {isWeightLogStreakEnabled(userId) ? (
        <motion.section {...fadeInUp} aria-label="Weight logging streak">
          <WeightStreakCard />
        </motion.section>
      ) : null}

      <NutritionEngagementTeasers userId={userId} />

      {isMedicationWellnessCardEnabled(userId) ? (
        <motion.section {...fadeInUp} aria-label="Medication checklist">
          <MedicationChecklistCard />
        </motion.section>
      ) : null}

      {isAiTrustFooterEnabled(userId) ? (
        <motion.section
          {...fadeInUp}
          className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-[11px] leading-relaxed text-zinc-500"
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
