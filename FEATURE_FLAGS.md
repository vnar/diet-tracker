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

### `FF_BILLING_ENABLED`

- **Default:** `false`.
- **Scope:** billing surface enablement for future paywall and checkout flows.
- **Env keys supported:** `FF_BILLING_ENABLED`, `NEXT_PUBLIC_FF_BILLING_ENABLED`.
