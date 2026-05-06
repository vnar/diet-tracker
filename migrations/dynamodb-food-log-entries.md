# Food log entries (DynamoDB)

Additive table for P1.3 photo food logging.

- **Table name:** `FoodLogEntries` (CDK: `FoodLogEntriesTable`)
- **Keys:** `userId` (PK, string), `foodLogId` (SK, string, e.g. `food#YYYY-MM-DD#<ts>#<rand>`)
- **Attributes:** `day`, `imageKey`, `estKcalLow`, `estKcalMid`, `estKcalHigh`, `estProtein`, `confidence`, `mealLabel`, `ts`, optional `confirmedKcal`, `confirmedProtein`, `confirmedTs`

Deploy via CDK (`infra/cdk/lib/backend-foundation-stack.ts`). Set `ANTHROPIC_API_KEY` on the backend Lambda in AWS (not in CloudFormation). Optional: `ANTHROPIC_FOOD_VISION_MODEL` (defaults to `claude-haiku-4-5`, same family as insights; override if needed). Vision accepts **JPEG/PNG/GIF/WebP only** — not HEIC; the API returns a clear error for HEIC/iPhone “High Efficiency” photos. Enable the feature with `FF_PHOTO_FOOD_LOG=true` at deploy time for the stack and matching web env.

**HTTP API (JWT):** `POST /v2/food/estimate` with JSON `{ "photoUrl": "s3://bucket/key", "day": "YYYY-MM-DD" }` → `{ estimate, foodLogId }`. `POST /v2/food/log-confirm` with `{ foodLogId, confirmedKcal, confirmedProtein }` → `{ ok: true }`. The static Next export does not host these routes; the app calls the configured `NEXT_PUBLIC_AWS_API_URL` when AWS backend is enabled.
