# Ojas Health — native shell (Expo)

Production-oriented foundation: **same Cognito user pool and HTTP API** as the web app (`NEXT_PUBLIC_*` → `EXPO_PUBLIC_*`).

## Requirements

- Node 20+ (matches tooling elsewhere in the monorepo)
- Xcode (iOS Simulator), Android Studio (emulator), or a physical device with Expo Go / dev client

## Configure

1. From repo root (AWS CLI logged in): `npm run env:mobile-from-stack` — writes `mobile/.env` from CloudFormation.
2. Or copy `.env.example` to `.env` and set the same **public** AWS values as web `.env.local` (`NEXT_PUBLIC_*` → `EXPO_PUBLIC_*`).
3. If you set values manually, include:

   - `EXPO_PUBLIC_USE_AWS_BACKEND=true`
   - `EXPO_PUBLIC_AWS_API_URL` — API Gateway base URL (https)
   - `EXPO_PUBLIC_COGNITO_REGION`, `EXPO_PUBLIC_COGNITO_USER_POOL_ID`, `EXPO_PUBLIC_COGNITO_USER_POOL_CLIENT_ID`

4. Optional: `EXPO_PUBLIC_POSTHOG_KEY` / `EXPO_PUBLIC_POSTHOG_HOST` (shared project with web).
5. Optional: `EXPO_PUBLIC_SENTRY_DSN` for crash reporting.

**Staging/production:** set `EXPO_PUBLIC_*` via [EAS Secrets](https://docs.expo.dev/build-reference/variables/) or `eas.json` profile `env` blocks — never commit real secrets.

## Run

```bash
cd mobile
npm install
npx expo start
```

Then press `i` (iOS) or `a` (Android).

If sign-in or env changes don’t apply, clear the Metro cache: `npx expo start --clear`.

## Analytics events (mobile)

- `app_opened`
- `mobile_login_completed`
- `mobile_screen_viewed` (props: `screen`)
- `mobile_error` (props: `where`, optional `message`)

## Project layout

- `app/` — Expo Router screens and tabs
- `src/api/ojasApi.ts` — fetch helpers aligned with `lib/frontend-api-client.ts` (Authorization + `x-cognito-access-token`)
- `src/auth/` — Cognito USER_PASSWORD_AUTH + SecureStore session
- `src/contracts/types.ts` — mirrors `lib/types.ts` entry/settings shapes
- `src/analytics/` — PostHog bridge + screen helper
- `src/telemetry/sentry.ts` — optional Sentry init

## EAS Build

```bash
npm i -g eas-cli
eas login
eas build --profile development --platform ios
```

Set missing secrets in the Expo dashboard before `production` builds.
