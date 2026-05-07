# Backfill: set `alcohol = false` from 2026-01-01

Use when stored rows incorrectly have `alcohol: true` for days with no drinking. The app treats **`alcohol: true` as “had alcohol”** (see insights).

## Steps

1. Get the user’s Cognito **`sub`** (JWT claim or Cognito console).
2. Get **`ENTRIES_TABLE_NAME`** from the deployed stack (same as Lambda `ENTRIES_TABLE_NAME`).
3. Dry run:

   ```bash
   DRY_RUN=1 ENTRIES_TABLE_NAME=… TARGET_USER_ID=… FROM_DATE=2026-01-01 node scripts/backfill-set-alcohol-false.mjs
   ```

4. Apply:

   ```bash
   ENTRIES_TABLE_NAME=… TARGET_USER_ID=… FROM_DATE=2026-01-01 node scripts/backfill-set-alcohol-false.mjs
   ```

5. Reload the app (or re-fetch entries) so the client sees updated flags.

Only rows with `alcohol === true` are updated. Days you truly drank still need `alcohol: true` via the UI after this if you cleared them by mistake.
