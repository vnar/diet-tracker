# Amplify hosting — make AWS sync actually work

The app is a **static export** (`out/`). `NEXT_PUBLIC_*` values are **baked into JavaScript at build time**. They must exist in **Amplify → Environment variables**, not only in your laptop’s `.env.local`.

## 1) One-time: Amplify Console environment variables

In **AWS Amplify** → your app → **Hosting** → **Environment variables** (per branch, e.g. `main`):

Set at least:

| Variable | Example source |
|----------|----------------|
| `NEXT_PUBLIC_USE_AWS_BACKEND` | `true` |
| `NEXT_PUBLIC_AWS_API_URL` | CloudFormation output `ApiUrl` (must be `https://…execute-api…`) |
| `NEXT_PUBLIC_AWS_REGION` | e.g. `us-east-1` |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | Output `UserPoolId` |
| `NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID` | Output `UserPoolClientId` |

Generate the lines locally (needs AWS CLI + stack deployed):

```bash
node scripts/print-dotenv-local-from-stack.mjs
```

Copy every `NEXT_PUBLIC_*` line into Amplify (same values).

## 2) Redeploy

Trigger a **new build** after saving variables. Old builds keep the old embedded URL.

## 3) Prove the API from your laptop

```bash
npm run diag:aws
```

Expect: `HTTP 401` and `OK: API is reachable`.

## 4) Photo uploads from `*.amplifyapp.com` (S3 CORS)

The S3 bucket only allows specific origins. For each Amplify preview/production **https** origin, deploy CDK with:

```bash
export PHOTO_CORS_EXTRA_ORIGINS='https://main.d1234567890.amplifyapp.com'
set -a && [ -f .env.local ] && . ./.env.local && set +a
npm run infra:cdk:deploy
```

Use the **exact** origin from the browser address bar (no trailing slash). Comma-separate multiple origins.

## 5) Build guard

`amplify.yml` runs `node scripts/assert-next-public-aws.mjs` before `npm run build`. If `NEXT_PUBLIC_USE_AWS_BACKEND=true` but required vars are missing, the **Amplify build fails** with a clear message instead of shipping a broken site.

## 6) Test portal: same experience for every host / preview branch

Photo uploads use **presigned S3 PUT**; the bucket CORS `AllowedOrigins` must include each site origin. For a **shared test portal** (Amplify `main`, PR previews, extra domains), either:

- Deploy CDK with **`PHOTO_CORS_ALLOW_ALL_ORIGINS=true`** (S3 uses `*` — fine for internal test; **never** for production), **or**
- Keep listing origins in **`PHOTO_CORS_EXTRA_ORIGINS`** (comma-separated).

Optional Amplify env so the **static bundle** turns on gated UI for everyone without per-user Lambda overrides:

| Variable | Suggested test value |
|----------|----------------------|
| `NEXT_PUBLIC_FF_PHOTO_FOOD_LOG` | `true` |
| `NEXT_PUBLIC_FF_MEAL_LIBRARY` | `true` |
| `NEXT_PUBLIC_FF_NL_MEAL_PARSE` | `true` |
| `NEXT_PUBLIC_FF_BODY_COMPARE_AI` | `true` |

Secrets (`ANTHROPIC_API_KEY`, Stripe, etc.) belong on **Lambda** via CDK deploy, not in the browser bundle. For a test-only Amplify branch you may still add non–`NEXT_PUBLIC_` vars for **build scripts** if you add them later; they are **not** exposed as `NEXT_PUBLIC_*` unless you prefix them that way.
