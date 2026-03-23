# HealthOS (diet-tracker)

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
