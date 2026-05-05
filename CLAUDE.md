# Ojas-Health — engineering playbook for AI agents

**Product:** multi-user web app for weight, habits, photos, sleep, and AI-driven health coaching.
**Stack (confirm by reading `package.json` / IaC files before any change):** likely Next.js + React + Tailwind, AWS Amplify or Lambda + DynamoDB or RDS Postgres. Treat this as a hypothesis until verified.

## Non-negotiable rules for every change

1. **Read before writing.** Map the project (`ls`, root config files, README, `app/` or `src/` tree). Summarize what you found before proposing changes. Never assume framework details — confirm them.
2. **Additive only.** New files, new routes (`/api/v2/...`), new tables, new nullable columns. Never edit existing components in place — wrap them, compose them, or add new props with safe defaults that preserve current behavior.
3. **Feature flags.** Every new feature ships behind a flag in `lib/featureFlags.ts`. Default OFF in prod. Document each flag in `FEATURE_FLAGS.md`.
4. **DB is sacred.** No drops, no renames, no type changes, no constraint changes on existing columns. New columns must be nullable. Output every migration as runnable SQL/CDK and ask before running.
5. **API versioning.** New endpoints get new paths. Never change the response shape of an existing endpoint. Add fields, never remove or rename.
6. **Tests required.** Each new module gets ≥1 happy-path and ≥1 edge-case test using the existing test runner. No new test framework without approval.
7. **Dependencies.** Prefer libs already in `package.json`. New deps require: justification, bundle-size impact, license. Ask before installing.
8. **Verify existing flows.** After every change, confirm: log weight → save → see in history → see on chart → photo upload → multi-user switching. All must still work.
9. **Secrets.** Never commit keys. Use `.env.local` for dev, the existing secrets manager for prod.
10. **Output format for every session:** (a) repo map + summary, (b) plan + files to create/extend with diffs, (c) full code, (d) migrations, (e) tests, (f) manual-QA checklist. Wait for "go" before writing code unless explicitly told to ship.

## Folder conventions for new code

- `lib/insights/` — rule-based + LLM-refined insights
- `lib/integrations/<provider>/` — external APIs (apple-health, withings, whoop, etc.)
- `lib/ml/` — predictive trajectory, plateau detection
- `app/api/v2/<feature>/route.ts` — versioned endpoints
- `components/v2/<feature>/` — new UI; never colocate with v1 components
- `migrations/` or `prisma/migrations/` — schema changes (additive only)
- `tests/<feature>/` — unit + integration tests

## Definition of done for any feature

- Behind a feature flag, default OFF
- Tests pass + new tests added
- `npm run build` succeeds
- Existing dashboard flows verified manually
- `FEATURE_FLAGS.md` updated
- PR description includes: what shipped, what's gated, how to enable, rollback plan
