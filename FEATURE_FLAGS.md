# Feature Flags Registry

## Conventions

- Flag names use `FF_*`.
- Env-based defaults should be OFF in production unless explicitly approved.
- Per-user overrides are stored in `FeatureFlagOverrides` and can be managed via `/admin/flags`.

## Flags

### `FF_INSIGHTS_V2`

- **Default:** `false` in production, optional `true` in development via env.
- **Scope:** user-facing insights v2 generation/rendering path.
- **Env keys supported:** `FF_INSIGHTS_V2`, `NEXT_PUBLIC_FF_INSIGHTS_V2`.

### `FF_INSIGHTS_LLM_REFINE`

- **Default:** `false`.
- **Scope:** no-op now; future copy refinement adapter for insights.
- **Env keys supported:** `FF_INSIGHTS_LLM_REFINE`, `NEXT_PUBLIC_FF_INSIGHTS_LLM_REFINE`.

### `FF_INSIGHTS_SOURCE_LABEL`

- **Default:** `true` when unset (shows AI vs rule-based labels on insight cards).
- **Scope:** Insights panel only; requires API field `generationSource` (`llm` | `rules`).
- **Env keys supported:** `FF_INSIGHTS_SOURCE_LABEL`, `NEXT_PUBLIC_FF_INSIGHTS_SOURCE_LABEL`, `NEXT_PUBLIC_INSIGHTS_SOURCE_LABEL`.

### `FF_BILLING_ENABLED`

- **Default:** `false`.
- **Scope:** billing surface enablement for future paywall and checkout flows.
- **Env keys supported:** `FF_BILLING_ENABLED`, `NEXT_PUBLIC_FF_BILLING_ENABLED`.

### `FF_PHOTO_FOOD_LOG`

- **Default:** `false` (CDK sets Lambda `FF_PHOTO_FOOD_LOG` to `false` unless deploy uses `FF_PHOTO_FOOD_LOG=true`).
- **Scope:** camera/upload on Today’s log → vision estimate → confirmation modal → fills calories/protein (save path unchanged). Requires AWS backend, `FoodLogEntries` table, and `ANTHROPIC_API_KEY` on the API Lambda.
- **Env keys supported:** `FF_PHOTO_FOOD_LOG`, `NEXT_PUBLIC_FF_PHOTO_FOOD_LOG`. Per-user overrides: flag id `FF_PHOTO_FOOD_LOG` in `FeatureFlagOverrides`.
- **API:** `GET /feature-flags` merges Lambda env `FF_PHOTO_FOOD_LOG` into `overrides` when unset in DynamoDB, so the web app can show the control after bootstrap without a separate `NEXT_PUBLIC_` build flag. DynamoDB overrides still win when present.

### `FF_MEAL_LIBRARY`

- **Default:** `false` (CDK sets Lambda `FF_MEAL_LIBRARY` to `false` unless deploy uses `FF_MEAL_LIBRARY=true`).
- **Scope:** P1.3.1 — personal meal library (`Meals` + `DayMealEntries` DynamoDB tables), “Meals today” list, optional extended photo confirm (`POST /v2/food/meal-complete`), `/meals` library page, quick-add from library / frequent carousel, and read-only calorie/protein totals when at least one meal entry exists for the day. Requires `FF_PHOTO_FOOD_LOG` for the photo completion path; library-only flows (quick-add, `/meals`) work whenever this flag is on and AWS backend is enabled.
- **Env keys supported:** `FF_MEAL_LIBRARY`, `NEXT_PUBLIC_FF_MEAL_LIBRARY`. Per-user overrides: `FF_MEAL_LIBRARY` in `FeatureFlagOverrides`.
- **API:** `GET /feature-flags` merges Lambda env `FF_MEAL_LIBRARY` into `overrides` when unset in DynamoDB (same pattern as photo food flag).

### `FF_NL_MEAL_PARSE`

- **Default:** `false` (CDK sets `FF_NL_MEAL_PARSE` on the dedicated `meal-nl-parse` Lambda to match deploy env).
- **Scope:** “Log a meal” natural-language textarea on the dashboard (above frequent meals). Calls `POST /v2/meals/nl-parse` (Anthropic), then uses existing `POST /v2/meals` and `POST /v2/days/{day}/meal-entries` on confirm. Optional `POST /v2/meals/nl-parse/invalidate-insights` clears the user’s AI insight cache rows after logging.
- **Requires:** `FF_MEAL_LIBRARY=true`, `ANTHROPIC_API_KEY` on the nl-parse Lambda, and deploy with `FF_NL_MEAL_PARSE=true`.
- **Env keys:** `FF_NL_MEAL_PARSE`, `NEXT_PUBLIC_FF_NL_MEAL_PARSE`. Per-user overrides: `FF_NL_MEAL_PARSE` in `FeatureFlagOverrides`.
- **Optional:** `ANTHROPIC_NL_MEAL_MODEL` at CDK deploy time for the nl-parse function.
