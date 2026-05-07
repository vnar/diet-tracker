"use client";

import { track } from "@/lib/analytics";

/** Unified meal stickiness / reuse funnel for PostHog (same gating as `track`: only sends when `NEXT_PUBLIC_POSTHOG_KEY` is set). */
export type MealStickinessPayload =
  | {
      action: "reuse_logged";
      day: string;
      mealId: string;
      entryId: string;
      source: "sheet" | "carousel" | "meals_page" | "quick_match";
    }
  | {
      action: "photo_uploaded";
      day: string;
    }
  | {
      action: "photo_flow_completed";
      day: string;
      foodLogId: string;
      entryId: string;
      saveToLibrary: boolean;
      libraryMealId: string | null;
      /** True when a new library row was created with this completion. */
      newLibraryItem: boolean;
      dishName?: string;
    }
  | {
      action: "library_item_edited";
      mealId: string;
      field: "name";
    };

export function trackMealStickiness(payload: MealStickinessPayload): void {
  track("meal_stickiness", payload as Record<string, unknown>);
}
