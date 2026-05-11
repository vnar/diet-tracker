/**
 * Personalized AI coaching nudges — normalized categories and API contract.
 * Raw PII stays in DynamoDB; only derived summaries flow through this layer.
 */
import type { InsightTone } from "@/lib/insights/types";

export type AiNudgeCategory =
  | "weight_trend"
  | "habit_pattern"
  | "nutrition_pattern"
  | "sleep_recovery"
  | "plateau"
  | "goal_progress";

export type AiNudgeSource = "rules" | "llm";

export type AiNudge = {
  id: string;
  title: string;
  message: string;
  /** 0–1 heuristic from sample size and rule strength (rules-only for now). */
  confidence: number;
  /** Plain-language citations from the user’s own logs (no external data). */
  supportingEvidence: string[];
  category: AiNudgeCategory;
  createdAt: string;
  /** Optional per-nudge footer; global disclaimer may also apply. */
  safetyNotice?: string;
  source: AiNudgeSource;
};

export type NormalizedDailyRow = {
  date: string;
  morningWeight: number;
  nightWeight?: number;
  calories?: number;
  protein?: number;
  steps?: number;
  sleep?: number;
  lateSnack: boolean;
  highSodium: boolean;
  workout: boolean;
  alcohol: boolean;
};

/**
 * Aggregated window the rule engine reads — no free-text notes to avoid leaking sensitive notes into prompts unintentionally.
 */
export type NormalizedUserHealthSnapshot = {
  asOfDate: string;
  /** Number of calendar days represented in `days` (may be < window if sparse logging). */
  windowDays: number;
  days: NormalizedDailyRow[];
  goalWeight: number;
  startWeight: number;
  targetDate: string;
  /** Optional: 7-day average kcal from logged daily entry field and/or meal pipeline. */
  recentAvgDailyCalories?: number | null;
};

export type PersonalizedCoachingApiPayload = {
  enabled: true;
  /** True when user is not on an active paid plan — nudges omitted, upgrade path shown. */
  gated: boolean;
  nudges: AiNudge[];
  globalSafetyNotice: string;
  /** Mirrors saved settings `tone` (coach voice) for client analytics and display. */
  coachTone?: InsightTone;
};
