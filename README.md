# Ojas-Health (diet-tracker)

Daily weight dashboard with static frontend export and optional AWS backend sync.

## Run locally (no Docker required)

```bash
npm install
npm run dev
```

By default the app runs in local mode (browser storage only).

## Optional: AWS backend sync

Set:

- `NEXT_PUBLIC_USE_AWS_BACKEND=true`
- `NEXT_PUBLIC_AWS_API_URL=<your-api-gateway-url>`

The frontend then uses AWS API endpoints for entries/settings/photos.

## Native mobile (Expo)

The [mobile/](mobile/) app is an iOS/Android shell that reuses the **same Cognito user pool and HTTP API** as the web app (`EXPO_PUBLIC_*` mirrors `NEXT_PUBLIC_*`). See [mobile/README.md](mobile/README.md).

**Amplify:** those variables must be set in the **Amplify Console** (build env), then redeploy — see [docs/AMPLIFY_DEPLOY.md](docs/AMPLIFY_DEPLOY.md). Run `npm run diag:aws` to verify API reachability.

**Amplify build guard:** `amplify.yml` runs `scripts/assert-next-public-aws.mjs` so a missing `NEXT_PUBLIC_AWS_API_URL` fails the build instead of producing a silent “Couldn’t reach the server” site.

### Photo food log + meal library (P1.3 / P1.3.1)

After sign-in, the app loads `GET /feature-flags` and caches those booleans. **Lambda defaults** can keep flags off while you still enable the UI locally:

1. In **`.env.local`** (not committed), set:

   - `NEXT_PUBLIC_FF_PHOTO_FOOD_LOG=true` — camera + estimate modal on Today’s log  
   - `NEXT_PUBLIC_FF_MEAL_LIBRARY=true` — meals today, library sheet, `/meals`, extended confirm  

   These override the API response for **client-side** gating only. Restart `npm run dev` after editing env.

2. **Meal APIs** (`/v2/meals/*`, `/v2/food/meal-complete`, etc.) still read **`FF_MEAL_LIBRARY`** / **`FF_PHOTO_FOOD_LOG`** on the API Lambda. Turn them on at deploy time, e.g.:

   `FF_PHOTO_FOOD_LOG=true FF_MEAL_LIBRARY=true npm run infra:cdk:deploy`

   (or set the same env vars your CDK deploy pipeline uses before `cdk deploy`). Otherwise the UI may appear but meal requests return 403 until Lambda matches.

3. **Anthropic / AI** — **`ANTHROPIC_API_KEY` is required** for `npm run infra:cdk:deploy` and `infra:cdk:synth` (see `infra/cdk/bin/backend-foundation.ts`). CDK bakes it into the **backend-api** and **meal-nl-parse** Lambdas. Load it from `.env.local` on the deploy machine, for example:

   ```bash
   set -a && [ -f .env.local ] && . ./.env.local && set +a
   FF_PHOTO_FOOD_LOG=true FF_MEAL_LIBRARY=true npm run infra:cdk:deploy
   ```

   Template-only synth without a key is possible only with `CDK_ALLOW_MISSING_ANTHROPIC_API_KEY=true` (not for production).

   On a normal deploy, the key is stored in **AWS Secrets Manager** and Lambdas read it via `GetSecretValue` using the ARN in their environment (the raw key is not kept in Lambda env vars after deploy).

   The value is still supplied to CloudFormation when the secret resource is created or updated; rotate the key in Secrets Manager or redeploy with a new `ANTHROPIC_API_KEY` if needed.

## Docker Postgres (legacy, optional)

```bash
docker compose up -d
# Set DATABASE_URL=postgresql://healthos:healthos@127.0.0.1:5432/healthos
# and switch Prisma provider to postgresql — only if you want Postgres locally.
```

## Product spec

See [`PROMPT.md`](PROMPT.md).

## Stage 6 cutover helper

Run the staged AWS deploy + env update + smoke checks:

```bash
AWS_REGION=us-east-1 \
AMPLIFY_APP_ID=<app-id> \
AMPLIFY_BRANCH=<branch> \
SMOKE_TEST_EMAIL=<email> \
SMOKE_TEST_PASSWORD=<password> \
npm run stage6:cutover
```

Notes:

- Requires working AWS CLI credentials.
- If `AMPLIFY_APP_ID` or `AMPLIFY_BRANCH` is missing, Amplify env update is skipped.
- If smoke test credentials are missing, API/data smoke tests are skipped.
