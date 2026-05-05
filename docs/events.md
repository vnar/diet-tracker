# Event Schema (P0.3)

## Overview

Analytics is emitted through `lib/analytics.ts` and `components/v2/AnalyticsBridge.tsx`.
If `NEXT_PUBLIC_POSTHOG_KEY` is missing, tracking no-ops safely.

## Initial events

### `dashboard_viewed`

- **When:** user lands on dashboard path (`/`)
- **Props:** `path`

### `weight_logged`

- **When:** global click listener sees save/update action on today's log buttons
- **Props:** `source`

### `day_saved`

- **When:** global click/submit listeners detect today's save action
- **Props:** `source`

### `photo_uploaded`

- **When:** global click listener sees photo upload action
- **Props:** `source`, `action`
