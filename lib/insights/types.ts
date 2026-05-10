import type { DailyEntry, PlateauUserSettings } from "@/lib/types";
import type { AiInsightStructured } from "@/lib/insights/aiInsightStructured";

export type InsightVote = "up" | "down" | "helpful" | "not_helpful" | "dismiss";
export type InsightCategory =
  | "sodium"
  | "alcohol"
  | "late_snack"
  | "workout"
  | "plateau"
  | "streak"
  | "trajectory";
export type InsightTone = "friendly" | "clinical" | "tough-love" | "ayurvedic";

/** Set by the insights API: whether headline/detail were rewritten by an LLM or left as rule output. */
export type InsightGenerationSource = "llm" | "rules";

export type UserPrefs = {
  userId?: string;
  firstName?: string;
  tone?: InsightTone;
  recentNotes?: string[];
  plateau?: PlateauUserSettings;
};

export interface Insight {
  id: string;
  ruleId: string;
  priority: number;
  headline: string;
  detail?: string;
  why: string[];
  action: string;
  category: InsightCategory;
  generationSource?: InsightGenerationSource;
  /** ISO timestamp when the AI card was generated (Lambda). */
  generatedAt?: string;
  /** Structured AI card zones (v2 layout). When set, the client renders AiInsightCardV2. */
  structured?: AiInsightStructured;
  /** True when the model returned invalid JSON twice; show minimal recovery UI. */
  degraded?: boolean;
}

export type InsightLog = DailyEntry & {
  goalWeight?: number;
  startWeight?: number;
  targetDate?: string;
};

export type InsightRule = (logs: InsightLog[], userPrefs: UserPrefs) => Insight | null;
