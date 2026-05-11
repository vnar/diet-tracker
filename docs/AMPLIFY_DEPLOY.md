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

## 5b) Version labels from GitHub (every push)

Amplify **preBuild** runs `node scripts/generate-build-meta.mjs`, which writes `lib/buildMeta.generated.json` from the checked-out repo:

- **`versionLabel`**: exact tag when `HEAD` is tagged (e.g. `v1.2.0`), otherwise `git describe --tags --always --long` (e.g. `v1.1.0-5-gabc1234`).
- **`commitShort`**, **`branch`** (`AWS_BRANCH` on Amplify), **last commit subject** (`git log -1`).

The footer **version chip** and the **top “This build”** changelog row read that file at **Next build** time, so each **successful deploy from GitHub** shows the right revision without hand-editing `lib/productVersion.ts`.

**Release semver (optional):** when you want a clean `v1.2.0` label instead of a describe string, tag the commit GitHub already built and redeploy (or push an empty commit):

```bash
git tag -a v1.2.0 -m "Weekly digest + email insights"
git push origin v1.2.0
```

Then either merge to `main` or trigger an Amplify redeploy on that commit so `HEAD` matches the tag.

**Local:** run `npm run gen:build-meta` after cloning (optional); otherwise the UI shows `v0.1.0-dev` and the static changelog history only.

## 5c) Footer: recent commits from GitHub (not only 3 milestone lines)

`amplify.yml` runs `node scripts/fetch-github-changelog.mjs`, which calls the public **GitHub REST API** (`GET /repos/{owner}/{repo}/commits`) for the current branch and writes `lib/githubChangelog.generated.json`. The footer then shows **this build**, up to **50 recent commits** (subject + link), then the static milestone list.

- **Repo detection:** `GITHUB_REPOSITORY` (GitHub Actions), `OJAS_GITHUB_REPO` (e.g. `owner/repo` in Amplify env), `package.json` `repository.url`, or `git remote get-url origin`.
- **Private repos or rate limits:** add a **fine-grained PAT** or `GITHUB_TOKEN` / `GH_TOKEN` in Amplify **Environment variables** (never commit it). Unauthenticated access works for public repos with a modest per-IP limit.
- **Local:** `npm run gen:github-changelog` or `npm run gen:footer-data` (build meta + GitHub). Without a network run, the committed **empty** `lib/githubChangelog.generated.json` stub leaves only milestones under “this build”.

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
