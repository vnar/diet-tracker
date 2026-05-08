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
  /** `null` when clearing via API; treat like undefined in UI state. */
  notes?: string | null;
  activityText?: string;
  activitySummary?: string;
  activityBurnKcal?: number;
  activityMet?: number;
  activityMinutes?: number;
  activityConfidence?: number;
}

/** Optional tuning for weight plateau detection (synced with backend settings when present). */
export type PlateauUserSettings = {
  rollingWindowDays?: number;
  comparisonSpanDays?: number;
  maxAvgMovementKg?: number;
};

export interface UserSettings {
  goalWeight: number;
  startWeight: number;
  targetDate: string;
  unit: "kg" | "lbs";
  tone?: "friendly" | "clinical" | "tough-love" | "ayurvedic";
  plateau?: PlateauUserSettings;
  /** Multiplier for activity-burn estimates (default 1.0). */
  activityCalibrationFactor?: number;
}

export type InsightSeverity = "warning" | "success" | "info" | "neutral";

export interface Insight {
  id: string;
  severity: InsightSeverity;
  message: string;
}
