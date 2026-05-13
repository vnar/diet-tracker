"use client";

import { motion } from "framer-motion";
import { isWeightLogStreakEnabled } from "@/lib/featureFlags";
import { WeightStreakCard } from "@/components/v2/streaks/WeightStreakCard";

const fadeInUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 },
};

export function DashboardRoadmapSections({ userId }: { userId?: string }) {
  if (!userId) return null;

  return (
    <>
      {isWeightLogStreakEnabled(userId) ? (
        <motion.section {...fadeInUp} aria-label="Weight logging streak">
          <WeightStreakCard />
        </motion.section>
      ) : null}
    </>
  );
}
