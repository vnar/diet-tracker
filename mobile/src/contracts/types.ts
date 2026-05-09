/**
 * API contract shapes aligned with `lib/types.ts` (web). Keep fields additive-only on the server;
 * mobile tolerates unknown fields via JSON parse.
 */

export interface DailyEntry {
  id: string;
  date: string;
  morningWeight: number;
  nightWeight?: number | null;
  calories?: number;
  protein?: number;
  steps?: number;
  sleep?: number;
  lateSnack: boolean;
  highSodium: boolean;
  workout: boolean;
  alcohol: boolean;
  photoUrl?: string | null;
  notes?: string | null;
  activityText?: string;
  activitySummary?: string;
  activityBurnKcal?: number;
  activityMet?: number;
  activityMinutes?: number;
  activityConfidence?: number;
}

export interface UserSettings {
  goalWeight: number;
  startWeight: number;
  targetDate: string;
  unit: "kg" | "lbs";
  tone?: "friendly" | "clinical" | "tough-love" | "ayurvedic";
  activityCalibrationFactor?: number;
  optInForecast?: boolean;
}
