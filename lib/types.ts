export interface DailyEntry {
  id: string;
  date: string;
  morningWeight: number;
  /** `null` when clearing via API; treat like undefined in UI state. */
  nightWeight?: number | null;
  calories?: number;
  protein?: number;
  steps?: number;
  sleep?: number;
  lateSnack: boolean;
  highSodium: boolean;
  workout: boolean;
  alcohol: boolean;
  /** `null` when clearing via API; treat like undefined in UI state. */
  photoUrl?: string | null;
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
