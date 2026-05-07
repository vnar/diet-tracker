import type { UserSettings } from "@/lib/types";

export type GoalSettingsSnapshot = Pick<UserSettings, "goalWeight" | "startWeight" | "targetDate">;

export type SavedGoalForm = {
  startWeight: number;
  goalWeight: number;
  targetDate: string;
};

/**
 * Returns which goal-related fields changed (for analytics). Empty if nothing changed.
 */
export function goalEditedFieldNames(
  prev: GoalSettingsSnapshot,
  saved: SavedGoalForm,
): ("start_weight" | "goal_weight" | "target_date")[] {
  const fields: ("start_weight" | "goal_weight" | "target_date")[] = [];
  if (prev.startWeight !== saved.startWeight) fields.push("start_weight");
  if (prev.goalWeight !== saved.goalWeight) fields.push("goal_weight");
  if (prev.targetDate !== saved.targetDate) fields.push("target_date");
  return fields;
}
