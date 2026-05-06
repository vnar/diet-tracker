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
