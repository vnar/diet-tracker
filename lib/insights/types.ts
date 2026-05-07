import type { DailyEntry, PlateauUserSettings } from "@/lib/types";

export type InsightVote = "up" | "down";
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
}

export type InsightLog = DailyEntry & {
  goalWeight?: number;
  startWeight?: number;
  targetDate?: string;
};

export type InsightRule = (logs: InsightLog[], userPrefs: UserPrefs) => Insight | null;
