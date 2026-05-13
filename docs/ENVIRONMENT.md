# Environment variables

Secrets belong in `.env.local` (Next.js), your shell session (CDK deploy), or the AWS console — never in git.

## Quick reference: local frontend (`.env.local`)

1. Copy `.env.example` to `.env.local`.
2. Fill **AWS public** values from the deployed stack (see below).
3. Optional: generate the five `NEXT_PUBLIC_*` AWS lines automatically (requires AWS CLI credentials):

```bash
node scripts/print-dotenv-local-from-stack.mjs >> .env.local
```

### Expo mobile (`mobile/.env`)

Use the same deployed stack with `EXPO_PUBLIC_*` names (file is gitignored):

```bash
npm run env:mobile-from-stack
```

Defaults: `CDK_STACK_NAME=DietTrackerBackendFoundation`, `AWS_REGION=us-east-1` (override with env vars; same as the `.env.local` stack script).

Stack outputs used: `ApiUrl`, `UserPoolId`, `UserPoolClientId`, `Region`, `BucketName` (from `infra/cdk/lib/backend-foundation-stack.ts`).

## CDK deploy-time (your laptop or CI shell)

Passed into the stack when you run `npm run infra:cdk:deploy` or `infra:cdk:synth`. These **bake into Lambda** where noted; they are **not** secrets in CloudFormation if you set them here (especially `ANTHROPIC_API_KEY` — prefer AWS console / Secrets Manager for production if you tighten this later).

**Anthropic:** `bin/backend-foundation.ts` calls `assertAnthropicApiKeyForCdk()` so synth/deploy **fails** if `ANTHROPIC_API_KEY` is unset or an obvious placeholder. On deploy, that value is written to **AWS Secrets Manager** (`{stack}-anthropic-api-key`); **backend-api** and **meal-nl-parse** Lambdas receive only `ANTHROPIC_API_KEY_SECRET_ARN` and load the key at runtime (so the key is not stored in Lambda environment variables). Stack output `AnthropicApiKeySecretArn` lists the ARN. To run CDK without a key (e.g. template-only CI), set `CDK_ALLOW_MISSING_ANTHROPIC_API_KEY=true` — do **not** use that for production deploys.

| Variable | Purpose |
|----------|---------|
| `CDK_DEFAULT_ACCOUNT` | AWS account (optional if CLI default is set). |
| `CDK_DEFAULT_REGION` | Region for the stack (optional if CLI default is set). |
| `CDK_ALLOW_MISSING_ANTHROPIC_API_KEY` | Set to `true` only to skip the Anthropic key check (non-production synth). |
| `ADMIN_EMAILS` | Comma-separated emails; Lambda `ADMIN_EMAILS` (default in code: app owner email). |
| `INSIGHTS_LLM_REFINE` | `"false"` to deploy Lambda with LLM refine off; default `"true"`. |
| `FF_PHOTO_FOOD_LOG` | `"true"` / `"false"` → Lambda feature flag for photo food logging. |
| `FF_MEAL_LIBRARY` | `"true"` / `"false"` → Lambda feature flag for meal library. |
| `ANTHROPIC_API_KEY` | **Required** for CDK synth/deploy (checked in `bin/backend-foundation.ts`). Used once to **create/update** the Secrets Manager secret; Lambdas use `ANTHROPIC_API_KEY_SECRET_ARN` at runtime. |
| `ANTHROPIC_FOOD_VISION_MODEL` | Optional; vision model id for food photos. |
| `ANTHROPIC_INSIGHTS_MODEL` | Read at runtime in `insights-ai-card` if set on the function; not always injected by CDK — set in Lambda console if you need a non-default model. |

## Lambda runtime (set by CDK + optional deploy env)

The **backend** Lambda (`http-api-handler`) receives table names, bucket, Cognito pool, TTLs, and the deploy-time flags above. You normally **do not** set these locally; they are defined in `backend-foundation-stack.ts`:

- `ENTRIES_TABLE_NAME`, `SETTINGS_TABLE_NAME`, `INSIGHT_FEEDBACK_TABLE_NAME`, `INSIGHT_CACHE_TABLE_NAME`, `FEATURE_FLAG_OVERRIDES_TABLE_NAME`
- `SUBSCRIPTIONS_TABLE_NAME`, `BILLING_EVENTS_TABLE_NAME`
- `FOOD_LOG_ENTRIES_TABLE_NAME`, `MEALS_TABLE_NAME`, `DAY_MEAL_ENTRIES_TABLE_NAME`
- `PHOTO_BUCKET_NAME`, `USER_POOL_ID`
- `UPLOAD_URL_TTL_SECONDS`, `DOWNLOAD_URL_TTL_SECONDS`
- `ADMIN_EMAILS`, `INSIGHTS_LLM_REFINE`, `FF_PHOTO_FOOD_LOG`, `FF_MEAL_LIBRARY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_FOOD_VISION_MODEL` (optional)

## Next.js app / browser (`NEXT_PUBLIC_*`)

See `.env.example` for the full list. Highlights:

- **AWS**: `NEXT_PUBLIC_USE_AWS_BACKEND`, `NEXT_PUBLIC_AWS_API_URL`, `NEXT_PUBLIC_AWS_REGION`, Cognito pool + client ids.
- **Feature flags**: insights v2, LLM refine, source label, billing, photo food log, meal library — mirror Lambda flags for UI; `HealthBootstrap` merges public flags with `/feature-flags`.
- **App**: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ADMIN_EMAILS`, analytics, optional `NEXT_PUBLIC_COST_DASHBOARD_URL`.

## Next.js server-only (local API routes / scripts)

| Variable | Where |
|----------|--------|
| `ANTHROPIC_API_KEY` | `lib/insights/llmRefiner.ts` (local refine; do not expose as `NEXT_PUBLIC_*`). |
| `INSIGHT_CACHE_TABLE_NAME` | `lib/insights/cacheStore.ts` if you run server code against DynamoDB locally. |
| `STRIPE_*` | Billing: secret key, webhook secret, price ids (`lib/billing/`). |
| `SUBSCRIPTIONS_TABLE_NAME`, `BILLING_EVENTS_TABLE_NAME` | `lib/billing/store.ts` when hitting DynamoDB from Next. |

## Operational scripts

| Script | Env vars |
|--------|-----------|
| `scripts/stage6-validate-cutover.mjs` | `CDK_STACK_NAME`, `AWS_REGION`, optional `AMPLIFY_APP_ID`, `AMPLIFY_BRANCH`, `SMOKE_TEST_EMAIL`, `SMOKE_TEST_PASSWORD` |
| `scripts/backfill-set-alcohol-false.mjs` | `ENTRIES_TABLE_NAME`, `TARGET_USER_ID`, optional `FROM_DATE`, `DRY_RUN`, `AWS_REGION` |
| `scripts/verify-persistent-db.mjs` | `DATABASE_URL` |

## Cognito / region fallbacks

`lib/cognito-config.ts` accepts both `NEXT_PUBLIC_*` and server-only `COGNITO_*` / `AWS_REGION` for pool id and client id. Prefer the `NEXT_PUBLIC_*` set for the static export.
