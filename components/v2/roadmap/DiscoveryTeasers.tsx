"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  isCareCircleTeaserEnabled,
  isCommunityRoadmapEnabled,
  isDeveloperHooksTeaserEnabled,
  isEmployerWellnessTeaserEnabled,
  isLabsRoadmapEnabled,
  isLocaleRoadmapCardEnabled,
  isSsoForTeamsTeaserEnabled,
  isWearablesRoadmapEnabled,
} from "@/lib/featureFlags";
import { track } from "@/lib/analytics";
import { RoadmapInfoCard } from "@/components/v2/roadmap/RoadmapInfoCard";

const fadeInUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 },
};

export function DiscoveryTeasers({ userId }: { userId: string }) {
  return (
    <>
      {isCareCircleTeaserEnabled(userId) ? (
        <motion.section {...fadeInUp} aria-label="Care circle sharing">
          <RoadmapInfoCard eyebrow="Care circle" title="Share progress safely (preview)">
            <p>
              Read-only sharing with a partner, coach, or clinician is on the roadmap — time-boxed links,
              no treatment advice inside the product.
            </p>
            <button
              type="button"
              className="text-xs font-semibold text-emerald-400 underline-offset-2 hover:underline"
              onClick={() => track("roadmap_care_circle_interest", {})}
            >
              I want early access
            </button>
          </RoadmapInfoCard>
        </motion.section>
      ) : null}

      {isWearablesRoadmapEnabled(userId) ? (
        <motion.section {...fadeInUp} aria-label="Wearables integration">
          <RoadmapInfoCard eyebrow="Wearables" title="Apple Health & more">
            <p>
              Automatic sync for steps, sleep, and workouts reduces manual logging and unlocks better
              energy-balance coaching.
            </p>
            <button
              type="button"
              className="text-xs font-semibold text-emerald-400 underline-offset-2 hover:underline"
              onClick={() => track("roadmap_wearables_interest", {})}
            >
              Notify me when sync ships
            </button>
          </RoadmapInfoCard>
        </motion.section>
      ) : null}

      {isLabsRoadmapEnabled(userId) ? (
        <motion.section {...fadeInUp} aria-label="Labs and biomarkers">
          <RoadmapInfoCard eyebrow="Labs" title="Biomarkers in context">
            <p>
              OCR-assisted lab import with trends vs your goals — always framed as “discuss with your doctor”
              — never diagnosis.
            </p>
            <button
              type="button"
              className="text-xs font-semibold text-emerald-400 underline-offset-2 hover:underline"
              onClick={() => track("roadmap_labs_interest", {})}
            >
              Join waitlist signal
            </button>
          </RoadmapInfoCard>
        </motion.section>
      ) : null}

      {isCommunityRoadmapEnabled(userId) ? (
        <motion.section {...fadeInUp} aria-label="Community challenges">
          <RoadmapInfoCard eyebrow="Community" title="Private challenges">
            <p>
              Small groups, opt-in leaderboards, and weekly team goals — designed for privacy-first
              accountability.
            </p>
            <button
              type="button"
              className="text-xs font-semibold text-emerald-400 underline-offset-2 hover:underline"
              onClick={() => track("roadmap_community_interest", {})}
            >
              I would join a beta cohort
            </button>
          </RoadmapInfoCard>
        </motion.section>
      ) : null}

      {isEmployerWellnessTeaserEnabled(userId) ? (
        <motion.section {...fadeInUp} aria-label="Employer wellness">
          <RoadmapInfoCard eyebrow="Employers" title="Team wellness programs">
            <p>
              SSO, aggregate reporting, and opt-in challenges for companies — individual rows stay private
              by default.
            </p>
            <button
              type="button"
              className="text-xs font-semibold text-emerald-400 underline-offset-2 hover:underline"
              onClick={() => track("roadmap_employer_interest", {})}
            >
              Talk to us about pilots
            </button>
          </RoadmapInfoCard>
        </motion.section>
      ) : null}

      {isSsoForTeamsTeaserEnabled(userId) ? (
        <motion.section {...fadeInUp} aria-label="SSO for teams">
          <RoadmapInfoCard eyebrow="Enterprise" title="SSO & provisioning">
            <p>SAML / OIDC sign-in and directory sync for larger organizations — planned after team accounts.</p>
            <button
              type="button"
              className="text-xs font-semibold text-emerald-400 underline-offset-2 hover:underline"
              onClick={() => track("roadmap_sso_interest", {})}
            >
              Request SSO roadmap
            </button>
          </RoadmapInfoCard>
        </motion.section>
      ) : null}

      {isDeveloperHooksTeaserEnabled(userId) ? (
        <motion.section {...fadeInUp} aria-label="Developer platform">
          <RoadmapInfoCard eyebrow="Developers" title="Webhooks & integrations">
            <p>
              Outbound events for weight logged, goals hit, and weekly recap ready — partner-friendly API tier
              later.
            </p>
            <Link
              href="https://github.com/vnar/diet-tracker"
              className="inline-block text-xs font-semibold text-emerald-400 underline-offset-2 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track("roadmap_developer_clicked", {})}
            >
              Star the repo / follow releases
            </Link>
          </RoadmapInfoCard>
        </motion.section>
      ) : null}

      {isLocaleRoadmapCardEnabled(userId) ? (
        <motion.section {...fadeInUp} aria-label="Localization">
          <RoadmapInfoCard eyebrow="Localization" title="Global-ready UI">
            <p>
              Spanish-first copy experiments, regional units, and meal vocabulary tuned per market — shipping
              behind gradual flags so nothing breaks for existing users.
            </p>
            <button
              type="button"
              className="text-xs font-semibold text-emerald-400 underline-offset-2 hover:underline"
              onClick={() => track("roadmap_locale_interest", {})}
            >
              Vote for your language
            </button>
          </RoadmapInfoCard>
        </motion.section>
      ) : null}
    </>
  );
}
