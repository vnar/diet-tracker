export interface DailyEntry {
  id: string;
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
  photoUrl?: string;
}

export interface UserSettings {
  goalWeight: number;
  startWeight: number;
  targetDate: string;
  unit: "kg" | "lbs";
}

export type InsightSeverity = "warning" | "success" | "info" | "neutral";

export interface Insight {
  id: string;
  severity: InsightSeverity;
  message: string;
}
