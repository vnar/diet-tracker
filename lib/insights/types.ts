import type { DailyEntry } from "@/lib/types";

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

export type UserPrefs = {
  userId?: string;
  firstName?: string;
  tone?: InsightTone;
  recentNotes?: string[];
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
}

export type InsightLog = DailyEntry & {
  goalWeight?: number;
  startWeight?: number;
  targetDate?: string;
};

export type InsightRule = (logs: InsightLog[], userPrefs: UserPrefs) => Insight | null;
