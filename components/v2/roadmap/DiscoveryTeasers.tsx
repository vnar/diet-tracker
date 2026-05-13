"use client";

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
import { CareCircleSharePanel } from "@/components/v2/roadmap/CareCircleSharePanel";
import { WearablesExportGuidePanel } from "@/components/v2/roadmap/WearablesExportGuidePanel";
import { LabsLocalPreviewPanel } from "@/components/v2/roadmap/LabsLocalPreviewPanel";
import { CommunityLocalChallengePanel } from "@/components/v2/roadmap/CommunityLocalChallengePanel";
import { DeveloperContextPanel } from "@/components/v2/roadmap/DeveloperContextPanel";

export function DiscoveryTeasers({ userId }: { userId: string }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {isCareCircleTeaserEnabled(userId) ? (
        <div className="h-full min-h-0" aria-label="Care circle sharing">
          <CareCircleSharePanel />
        </div>
      ) : null}

      {isWearablesRoadmapEnabled(userId) ? <WearablesExportGuidePanel /> : null}

      {isLabsRoadmapEnabled(userId) ? <LabsLocalPreviewPanel /> : null}

      {isCommunityRoadmapEnabled(userId) ? <CommunityLocalChallengePanel /> : null}

      {isEmployerWellnessTeaserEnabled(userId) ? (
        <RoadmapInfoCard eyebrow="Employers" title="Team wellness programs">
          <p>
            SSO, aggregate reporting, and opt-in challenges for companies — individual rows stay private by
            default. Contact us if you are evaluating a pilot.
          </p>
          <button
            type="button"
            className="text-xs font-semibold text-emerald-400 underline-offset-2 hover:underline"
            onClick={() => track("roadmap_employer_interest", {})}
          >
            Register pilot interest
          </button>
        </RoadmapInfoCard>
      ) : null}

      {isSsoForTeamsTeaserEnabled(userId) ? (
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
      ) : null}

      {isDeveloperHooksTeaserEnabled(userId) ? <DeveloperContextPanel /> : null}

      {isLocaleRoadmapCardEnabled(userId) ? (
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
      ) : null}
    </div>
  );
}
