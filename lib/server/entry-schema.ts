import { z } from "zod";

const photoLimit = 600_000;

export const dailyEntryUpsertSchema = z.object({
  id: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  morningWeight: z.number().positive(),
  nightWeight: z.number().optional(),
  calories: z.number().int().nonnegative().optional(),
  protein: z.number().int().nonnegative().optional(),
  steps: z.number().int().nonnegative().optional(),
  sleep: z.number().nonnegative().optional(),
  lateSnack: z.boolean(),
  highSodium: z.boolean(),
  workout: z.boolean(),
  alcohol: z.boolean(),
  photoUrl: z.string().max(photoLimit).optional(),
});

export const settingsPatchSchema = z.object({
  goalWeight: z.number().positive(),
  startWeight: z.number().positive(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  unit: z.enum(["kg", "lbs"]),
});

export type DailyEntryUpsertInput = z.infer<typeof dailyEntryUpsertSchema>;
export type SettingsPatchInput = z.infer<typeof settingsPatchSchema>;
