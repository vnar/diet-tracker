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

### `FF_PRO_MONETIZATION`

- **Default:** `false` when unset (opt-in: set `NEXT_PUBLIC_FF_PRO_MONETIZATION=true` and/or per-user override `FF_PRO_MONETIZATION` in `FeatureFlagOverrides`).
- **Scope:** Client-side Pro gates for NL meal parse, photo food estimate, and voice parse soft caps; `/account/billing` checkout CTA when combined with `FF_BILLING_ENABLED` or this flag. Requires API `GET /settings` `subscription` snapshot and deployed `POST /v2/billing/checkout-session` / `POST /v2/billing/portal` with `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY`.
- **Env keys supported:** `FF_PRO_MONETIZATION`, `NEXT_PUBLIC_FF_PRO_MONETIZATION`.

### `FF_VOICE_DAILY_LOGGING`

- **Default:** `true` when unset (opt-out: set `FF_VOICE_DAILY_LOGGING=false` / `NEXT_PUBLIC_FF_VOICE_DAILY_LOGGING=false` to disable).
- **Scope:** “Voice” entry on Today’s log: Web Speech API transcript (client-only audio), optional `POST /api/v2/voice-daily-log/parse` (Cognito bearer + text only) to fill review fields; user must **Apply to today’s form** then **Save today**. Transcript is not stored unless the user opts in via checkboxes in the review step.
- **Env keys supported:** `FF_VOICE_DAILY_LOGGING`, `NEXT_PUBLIC_FF_VOICE_DAILY_LOGGING`. Per-user overrides: `FF_VOICE_DAILY_LOGGING` in `FeatureFlagOverrides`.
- **Server:** `POST /v2/voice-daily-log/parse` on the main AWS API Lambda (same `ANTHROPIC_API_KEY` as food vision). Local dev without AWS can still use the Next.js `/api/v2/voice-daily-log/parse` route + `getAnthropicApiKeyForServer()` (`secrets.toml` in non-production). Optional `ANTHROPIC_VOICE_DAILY_MODEL`.

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

### `FF_BODY_COMPARE_AI`

- **Default:** `false` in production by policy; test portal can set `true`.
- **Scope:** AI visual assessment for progress-photo compare mode. Returns estimate-only body-composition trend commentary and confidence/disclaimer text. No diagnosis or medical claims.
- **Requires:** progress photos enabled, AWS backend, `ANTHROPIC_API_KEY` on API Lambda.
- **Env keys:** `FF_BODY_COMPARE_AI`, `NEXT_PUBLIC_FF_BODY_COMPARE_AI`. Per-user overrides: `FF_BODY_COMPARE_AI` in `FeatureFlagOverrides`.

### `FF_WEEKLY_REPORT`

- **Default:** `true` when unset (opt-out: `NEXT_PUBLIC_FF_WEEKLY_REPORT=false` / `FF_WEEKLY_REPORT=false`, or per-user override `FF_WEEKLY_REPORT` in `FeatureFlagOverrides`).
- **Scope:** AI Weekly Report Card — seven-day aggregate from logs (weight, check-ins, meals, calories/protein, steps/sleep, habit toggles, optional medication-keyword hint in notes, progress photo count), rule-based sections (what changed / helped / harder / one experiment), coach tone from settings, in-app **Weekly recap & email** card on the dashboard (above **AI insights**), and copy-friendly HTML/plain text. Analytics: `weekly_report_generated`, `weekly_report_viewed`, `weekly_report_email_opened` (email export preview), `weekly_report_email_send_clicked`, `weekly_report_email_sent`, `weekly_report_email_failed`, `next_experiment_clicked`, `weekly_report_dismissed`.
- **Env keys supported:** `FF_WEEKLY_REPORT`, `NEXT_PUBLIC_FF_WEEKLY_REPORT`.
- **LLM:** Rule-based only in v1; optional LLM refinement can be added later without changing the aggregate contract.
- **Dev:** Regenerate static sample HTML (banner for Vihar Nar / viharnar@gmail.com): `npm run gen:weekly-email-preview` → `public/email-previews/weekly-report-sample-vihar-nar.html` (open locally or at `/email-previews/weekly-report-sample-vihar-nar.html` when hosted). Not a real email send.

### `FF_WEEKLY_DIGEST_SCHEDULER`

- **Default:** `false` when unset (no EventBridge invocations; rule is **disabled** in CDK).
- **Scope:** **Monday 14:30 UTC** EventBridge invokes `WeeklyDigestLambda`, which paginates Cognito users, reads **`weeklyDigestEmail`** from **Settings** (DynamoDB), loads that user’s **entries + progress photos** for the completed week (same window as the in-app weekly card), builds the **rule-based** report (`buildWeeklyAggregate` → `buildWeeklyReportFromRules` → email HTML), and sends via **SES** (same MIME path as `POST /v2/weekly-report/send-email`). Writes **`WeeklyDigestLog`** (`userId` + `weekStart`) so each user receives **at most one** digest per week. Cap per run: **`WEEKLY_DIGEST_MAX_USERS_PER_RUN`** (default 500). **Note:** the digest job does not yet load **meal-library** rows per day (the in-app generator can when the library flag is on); v1 digest uses **day entries + photos** only.
- **Env keys (Lambda / CDK deploy machine):** `FF_WEEKLY_DIGEST_SCHEDULER=true` **and** `FF_WEEKLY_REPORT_EMAIL` not `false` **and** configured **`TRANSACTIONAL_EMAIL_FROM`**. Users opt in with **`weeklyDigestEmail: true`** on **`PATCH /settings`** (see `UserSettings` in `lib/types.ts`); web UI: checkbox under **Email to my inbox** on the weekly recap card.
- **IAM / data:** New table **`WeeklyDigestLog`**; digest Lambda has read **Entries**, **Settings**, **ProgressPhotos**, read/write **WeeklyDigestLog**, **`cognito-idp:ListUsers`**, **`ses:SendRawEmail`**.

### `FF_WEEKLY_REPORT_EMAIL`

- **Default:** `true` when unset on **web** and **API Lambda** (CDK sets `FF_WEEKLY_REPORT_EMAIL` to `true` unless the deploy machine exports `FF_WEEKLY_REPORT_EMAIL=false`). Opt out with `false` on either side.
- **Scope:** Shows **Email to my inbox** on the weekly recap when `FF_WEEKLY_REPORT` is also on. Calls `POST /v2/weekly-report/send-email` on the main API Lambda; SES sends HTML to the caller’s **verified Cognito email** only (no arbitrary recipients).
- **Env keys (web):** `FF_WEEKLY_REPORT_EMAIL`, `NEXT_PUBLIC_FF_WEEKLY_REPORT_EMAIL`. Per-user overrides: `FF_WEEKLY_REPORT_EMAIL` in `FeatureFlagOverrides`.
- **Env keys (Lambda / CDK deploy machine):** omit or `true` to enable the route; set `FF_WEEKLY_REPORT_EMAIL=false` to disable. **`TRANSACTIONAL_EMAIL_FROM`** must be a **verified SES email identity** (same region as the stack / Lambda) or the handler returns **503**. In SES sandbox, destination addresses must also be verified.
- **Deliverability (Gmail / inbox):** Sending with a **consumer freemail address** (e.g. `@gmail.com`) as **From** through SES almost always **fails DMARC alignment** (Gmail did not authorize Amazon’s servers to send as `@gmail.com`), so messages often land in **Spam** until you move to a **domain-aligned sender**. The reliable fix: add a **domain identity** in SES (same region), publish **Easy DKIM** CNAMEs at your DNS host, add **SPF** (`include:amazonses.com`) and **DMARC**, then set **`TRANSACTIONAL_EMAIL_FROM`** to e.g. `weekly@ojas-health.com`. Until then, the stack sets **`TRANSACTIONAL_EMAIL_BRAND_DOMAIN`** (default `ojas-health.com`) so outbound mail includes **List-ID** + **Auto-Submitted** and a **GET-only** `List-Unsubscribe: <https://{brand}/>` (no RFC 8058 POST unless **`TRANSACTIONAL_EMAIL_LIST_UNSUBSCRIBE_ONE_CLICK=true`** and your URL handles POST). Other optional Lambda env: **`TRANSACTIONAL_EMAIL_FROM_NAME`**, **`TRANSACTIONAL_EMAIL_REPLY_TO`**, **`TRANSACTIONAL_EMAIL_MESSAGE_ID_DOMAIN`** (only when From is already on your domain; do **not** set to your brand domain while From is still `@gmail.com` or Message-ID can look forged), **`TRANSACTIONAL_EMAIL_LIST_UNSUBSCRIBE_URL`** (override default `https://{brand}/`).
- **IAM:** CDK grants the API Lambda `ses:SendEmail` and `ses:SendRawEmail` (multipart/alternative + headers).
- **Dependency:** `infra/cdk` must include `@aws-sdk/client-ses` — run `npm install` under `infra/cdk` (if `ENOTEMPTY` errors, remove `infra/cdk/node_modules` and reinstall).

### `FF_PERSONALIZED_AI_COACHING`

- **Default:** `true` (CDK sets Lambda `FF_PERSONALIZED_AI_COACHING` to `true` unless deploy uses `FF_PERSONALIZED_AI_COACHING=false` — opt-out like `FF_MEAL_LIBRARY`).
- **Scope:** Adds `personalizedCoaching` to `GET /v2/insights`: rule-based nudges from normalized entry/settings data (weight, calories, sleep, habits, goals), explainability strings, safety copy, and Pro gating (paid active/trialing plans only). Feedback supports `helpful` / `not_helpful` / `dismiss` (stored on `INSIGHT_FEEDBACK`); analytics: `ai_nudge_generated`, `ai_nudge_viewed`, `ai_nudge_helpful`, `ai_nudge_dismissed`, plus funnel events `paywall_viewed` / `upgrade_clicked` when the coaching gate is shown.
- **Env keys:** `FF_PERSONALIZED_AI_COACHING`, `NEXT_PUBLIC_FF_PERSONALIZED_AI_COACHING`. Per-user overrides: `FF_PERSONALIZED_AI_COACHING` in `FeatureFlagOverrides` (client) and `isPersonalizedAiCoachingEnabled` for Next attachment when env is unset.
- **Future:** `LlmNudgeProvider` stub in `lib/aiNudges/providers.ts` for optional LLM-backed nudges without changing the API envelope.
