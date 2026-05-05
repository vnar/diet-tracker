import type { DailyEntry } from "@/lib/types";

export type InsightVote = "up" | "down";

export interface InsightCard {
  id: string;
  ruleId: string;
  priority: number;
  headline: string;
  detail?: string;
  why: string[];
}

export type InsightLog = DailyEntry & {
  goalWeight?: number;
  startWeight?: number;
  targetDate?: string;
};

export type InsightRule = (logs: InsightLog[]) => InsightCard | null;
