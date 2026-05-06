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

### Photo food log + meal library (P1.3 / P1.3.1)

After sign-in, the app loads `GET /feature-flags` and caches those booleans. **Lambda defaults** can keep flags off while you still enable the UI locally:

1. In **`.env.local`** (not committed), set:

   - `NEXT_PUBLIC_FF_PHOTO_FOOD_LOG=true` — camera + estimate modal on Today’s log  
   - `NEXT_PUBLIC_FF_MEAL_LIBRARY=true` — meals today, library sheet, `/meals`, extended confirm  

   These override the API response for **client-side** gating only. Restart `npm run dev` after editing env.

2. **Meal APIs** (`/v2/meals/*`, `/v2/food/meal-complete`, etc.) still read **`FF_MEAL_LIBRARY`** / **`FF_PHOTO_FOOD_LOG`** on the API Lambda. Turn them on at deploy time, e.g.:

   `FF_PHOTO_FOOD_LOG=true FF_MEAL_LIBRARY=true npm run infra:cdk:deploy`

   (or set the same env vars your CDK deploy pipeline uses before `cdk deploy`). Otherwise the UI may appear but meal requests return 403 until Lambda matches.

3. **Food vision** needs **`ANTHROPIC_API_KEY`** on the same API Lambda. CDK passes it from the **deploy machine** when present (e.g. load `.env.local` before deploy). Example:

   ```bash
   set -a && [ -f .env.local ] && . ./.env.local && set +a
   FF_PHOTO_FOOD_LOG=true FF_MEAL_LIBRARY=true npm run infra:cdk:deploy
   ```

   The value is stored in CloudFormation like other Lambda env strings; rotate the key if the template is too exposed for your threat model, or move to Secrets Manager later.

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
