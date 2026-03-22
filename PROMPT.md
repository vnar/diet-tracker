# HealthOS: Product & Build Prompts

Single document: **Phase 1** (client-only MVP) and **Phase 2** (backend, auth, Postgres). Default build order is Phase 1 first, then Phase 2 as an extension.

---

## Table of contents

1. [Phase 1: Daily Awareness Dashboard (v2)](#phase-1-daily-awareness-dashboard-v2)  
   - [Role](#role) · [Project](#project) · [Tech stack](#tech-stack) · [Design system](#design-system) · [File structure](#file-structure) · [Data model](#data-model) · [Zustand store](#zustand-store) · [Feature specs](#feature-specs) · [UX constraints](#ux-constraints) · [Empty states](#empty-states) · [Code quality](#code-quality-rules-phase-1) · [What not to build (Phase 1)](#what-not-to-build-mvp-scope-guard-phase-1) · [Output order (Phase 1)](#output-order-phase-1)
2. [Phase 2: Backend and persistence (v3)](#phase-2-backend-and-persistence-v3)  
   - [Role (Phase 2)](#role-phase-2) · [Goal (Phase 2)](#goal-phase-2) · [Tech stack (Phase 2)](#tech-stack-phase-2) · [Data model (Prisma)](#data-model-prisma) · [Security](#security-row-level-access-mandatory) · [API shape](#api-shape-suggested) · [Optimistic updates](#client-optimistic-updates-useentries-hook) · [Auth](#auth-nextauth-v5) · [Environment](#environment) · [Scope guard (Phase 2)](#scope-guard-phase-2-do-not-build) · [Deliverables (Phase 2)](#deliverables-phase-2) · [Quality bar (Phase 2)](#quality-bar-phase-2) · [Output order (Phase 2)](#output-order-phase-2)

---

# Phase 1: Daily Awareness Dashboard (v2)

### Prompt v2 (Production-Ready)

---

## Role

You are a senior full-stack engineer and product designer with taste. You write code that is readable, minimal, and intentional — no boilerplate, no over-engineering. Think Vercel's internal tooling, or Linear's dashboard: clean, fast, opinionated.

---

## Project

Build **HealthOS – Daily Awareness Dashboard** — a personal health tracker that separates signal from noise in daily weight fluctuations and gives actionable insight.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v3 |
| Charts | Recharts |
| State | Zustand (with `persist` middleware → LocalStorage) |
| Animations | Framer Motion (subtle, never flashy) |
| Icons | Lucide React |

No backend. No database. No auth. localStorage only for MVP.

---

## Design System

**Color palette (dark mode default):**

- Background: `zinc-950`
- Surface (cards): `zinc-900`
- Border: `zinc-800`
- Text primary: `zinc-100`
- Text secondary: `zinc-400`
- Accent: `emerald-500` (weight down = good)
- Danger: `rose-500` (weight up)
- Neutral: `zinc-500`

**Typography:**

- Font: System font stack (`font-sans`)
- Headings: `font-semibold tracking-tight`
- Data values: `font-mono` for numbers (weight, calories, etc.)

**Card spec:**

```
bg-zinc-900 border border-zinc-800 rounded-2xl p-5
```

**Transitions:**

- All interactive elements: `transition-all duration-200`
- Page-level elements: Framer Motion `fadeInUp` (y: 10 → 0, opacity: 0 → 1, duration: 0.3)

**Light mode:** Toggle supported. Use `dark:` Tailwind classes throughout. Default to dark.

---

## File Structure

```
/app
  layout.tsx          ← Root layout, font, theme provider
  page.tsx            ← Main dashboard page (server component shell)
  globals.css         ← Tailwind base + custom CSS vars

/components
  /ui
    Card.tsx          ← Base card wrapper with optional title
    InputField.tsx    ← Labeled input with units label
    Toggle.tsx        ← Yes/no toggle with label
    Badge.tsx         ← Small status chip
  DailyInput.tsx      ← Full input form (top section)
  DashboardCards.tsx  ← KPI grid (6 cards)
  WeightChart.tsx     ← Recharts line chart wrapper
  AIInsights.tsx      ← Rule-based insights card
  PhotoTracker.tsx    ← Photo upload + timeline grid

/lib
  store.ts            ← Zustand store + persist middleware
  calculations.ts     ← 7-day avg, delta, moving average
  insights.ts         ← Insight rule engine (pure function)
  types.ts            ← TypeScript interfaces
```

---

## Data Model

```typescript
// lib/types.ts

export interface DailyEntry {
  id: string;           // nanoid or Date.toISOString()
  date: string;         // "YYYY-MM-DD"
  morningWeight: number;
  nightWeight?: number;
  calories?: number;
  protein?: number;
  steps?: number;
  sleep?: number;
  lateSnack: boolean;
  highSodium: boolean;
  photoUrl?: string;    // base64 or blob URL
}

export interface UserSettings {
  goalWeight: number;
  startWeight: number;
  targetDate: string;   // "YYYY-MM-DD"
  unit: 'kg' | 'lbs';
}
```

---

## Zustand Store

```typescript
// lib/store.ts — shape only, you implement
interface HealthStore {
  entries: DailyEntry[];
  settings: UserSettings;
  addEntry: (entry: DailyEntry) => void;
  updateEntry: (id: string, entry: Partial<DailyEntry>) => void;
  updateSettings: (s: Partial<UserSettings>) => void;
}
// Use persist middleware → localStorage key: "healthos-data"
```

---

## Feature Specs

### 1. Daily Input Panel

- Fields: morningWeight (required), nightWeight, calories, protein, steps, sleep, lateSnack (toggle), highSodium (toggle)
- UX requirements:
  - Tab-friendly (keyboard-first)
  - `morningWeight` field auto-focuses on mount
  - Save button disabled until morningWeight is filled
  - On save: animate card with a brief success pulse (Framer Motion)
  - Show "Updated today" if entry for today already exists — allow overwrite
- Do NOT use a modal or drawer. Inline form only.

### 2. Dashboard Cards (6-card grid)

Render as a 2×3 responsive grid (mobile: 2 col, desktop: 3 col):

| Card | Value | Subtext |
|------|-------|---------|
| Today's Weight | `82.4 kg` | Morning reading |
| Change | `+0.6 kg` | vs yesterday — color: rose/emerald |
| 7-Day Average | `82.1 kg` | Rolling average |
| Total Progress | `85 → 82.4 → 72` | start → current → goal |
| Remaining | `10.4 kg` | To goal |
| Countdown | `T-118 days` | To target date |

### 3. Weight Trend Chart

- Recharts `ComposedChart`
- Two lines:
  1. `Line` — daily weight (thin, dotted, `zinc-500`)
  2. `Line` — 7-day moving average (thick, solid, `emerald-500`)
- X-axis: formatted dates (`MMM D`)
- Y-axis: auto domain with 1kg padding
- Custom tooltip: shows date, weight, avg
- Responsive: `ResponsiveContainer width="100%" height={260}`
- Empty state: "Log at least 2 days to see your trend" in center of chart area

### 4. AI Insight Engine

Pure function in `lib/insights.ts`:

```typescript
function generateInsights(
  today: DailyEntry,
  yesterday: DailyEntry | null,
  last7: DailyEntry[]
): Insight[]
```

**Rules (evaluate all, return max 3, prioritize by severity):**

| Condition | Message | Severity |
|-----------|---------|----------|
| weight increase ≥ 0.7kg AND (highSodium OR sleep < 6) | "Weight spike likely water retention — sodium or sleep quality." | warning |
| weight decreasing for 3+ consecutive days | "Solid downward trend. Stay consistent." | success |
| protein < 60g | "Protein is low. Aim for 1.6–2g per kg to protect muscle." | info |
| lateSnack = true | "Late-night eating shifts hunger hormones the next morning." | info |
| sleep < 6 | "Under 6h sleep raises cortisol and cravings. Prioritize rest." | warning |
| steps < 4000 | "Low movement today. Even a 20-min walk makes a difference." | info |
| No logs yet / today only | Show onboarding nudge: "Log a few days to unlock insights." | neutral |

Display: Cards with left-border accent (rose/emerald/zinc based on severity), icon (Lucide), and message. Stack vertically, max 3.

### 5. Photo Tracker

- Upload button → `<input type="file" accept="image/*">` hidden, triggered by styled button
- Convert to base64, attach to today's entry
- Display: masonry-style grid (3 col desktop, 2 col mobile), newest first
- Each photo: show date label overlay on hover
- Empty state: dashed border card with camera icon

---

## UX Constraints

- **No skeleton loaders** — data is local, always instant
- **No modals** — everything inline
- **No page navigation** — single page, all sections visible
- **Scroll order:** Header → Input → Cards → Chart → Insights → Photos
- **Mobile:** stack everything single column, bottom padding for safe area
- **Spacing system:** consistent `gap-4` or `gap-6` between sections, `p-5` inside cards

---

## Empty States

Each section must have a graceful empty state:

- Input: pre-filled with yesterday's values as placeholders if available
- Cards: show `—` for missing data, no broken layout
- Chart: "Start logging to see your trend" with a subtle dotted placeholder line
- Insights: "Log a few days to unlock your first insight"
- Photos: dashed upload zone with camera icon

---

## Code quality rules (Phase 1)

- TypeScript strict mode — no `any`
- Every component has a clearly typed `Props` interface
- `lib/calculations.ts` is pure functions only — no side effects
- `lib/insights.ts` is pure functions only — no side effects
- Comments only where logic is non-obvious (no obvious comments like `// set state`)
- No `console.log` in final code
- No unused imports

---

## What NOT to build (MVP scope guard, Phase 1)

- No backend / API routes
- No user auth
- No charts other than weight trend
- No drag-and-drop for photos
- No export/import (yet)
- No notifications

---

## Output order (Phase 1)

Produce all files. Start with `lib/types.ts`, then `lib/store.ts`, then `lib/calculations.ts`, then `lib/insights.ts`, then UI components bottom-up, then feature components, then `app/layout.tsx`, then `app/page.tsx`.

Build this like you're shipping to a thousand users on Monday.

---

# Phase 2: Backend and persistence (v3)

### Prompt v3 (Backend)

---

## Role (Phase 2)

You are a senior backend-oriented full-stack engineer. You extend the existing HealthOS Next.js app with authenticated multi-user persistence while preserving the current UX (single-page dashboard, fast perceived performance). You favor boring, proven patterns over novelty.

---

## Goal (Phase 2)

Add a **real backend** so each signed-in user’s daily entries and settings are stored **server-side** (PostgreSQL), replacing local-only `localStorage` for production use. The client may keep a thin cache for offline feel, but **source of truth is the database**.

---

## Tech stack (Phase 2)

| Layer | Choice | Why |
|--------|--------|-----|
| API | **Next.js Route Handlers** (`app/api/**/route.ts`) | One deployable, shared types, no separate Node service |
| ORM | **Prisma** | Type-safe queries, schema-first, migrations |
| Database | **PostgreSQL** | Relational model fits users + dated entries; hosted anywhere (Neon, RDS, etc.) |
| Auth | **NextAuth.js v5** (`next-auth@beta` or stable v5 line) | Google OAuth + email magic link with minimal config |
| Client data | **React hooks + fetch** (e.g. `useEntries.ts`) | Clear loading/error; pair with optimistic updates |

Do **not** introduce a second HTTP server (Express/Fastify) unless explicitly required later.

---

## Data model (Prisma)

- Mirror the existing **`DailyEntry`** and **`UserSettings`** shapes from the frontend, but **namespace everything by `userId`**.
- **Critical constraint:** enforce **one log per calendar day per user** at the database level:

```prisma
model DailyEntry {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  date          String   // "YYYY-MM-DD"
  // ... morningWeight, nightWeight, calories, protein, steps, sleep, flags, photoUrl, etc.

  @@unique([userId, date])
  @@index([userId, date])
}
```

**Why this matters:** Without `@@unique([userId, date])`, naive `create` calls duplicate rows; the product’s upsert semantics (“overwrite today”) must match the DB. The AI must use **`upsert`** or **transactional find-then-update** aligned with this constraint—never blind `create` for daily rows.

- `UserSettings` (goal weight, start weight, target date, unit) should be **one row per user** (`userId` `@unique` or `@@id` on `userId`).

---

## Security: row-level access (mandatory)

**Plain-language rule:** Every query and every Route Handler that reads or writes health data **must scope by the authenticated user’s ID**. There is no “admin reads all” in MVP.

- Resolve the session in the handler (NextAuth `auth()` or `getServerSession`).
- **Reject** unauthenticated requests with `401`.
- **Never** accept `userId` from the client body/query for authorization; **derive `userId` only from the session**.
- Every Prisma call must include `where: { userId: sessionUserId, ... }` (or equivalent join) so users cannot read or overwrite another user’s rows.

Document this in code with a short comment only where non-obvious (e.g. shared helper `requireUser()`).

---

## API shape (suggested)

Implement REST-style Route Handlers under `app/api/`, for example:

- `GET /api/entries` — list entries (optional `from` / `to` query params).
- `PUT /api/entries/[date]` — upsert **one** day (body matches `DailyEntry` fields minus `userId`).
- `GET /api/settings` / `PATCH /api/settings` — read/update `UserSettings`.

Use Zod (or similar) to validate request bodies server-side. Return consistent JSON error shapes (`{ error: string }`).

---

## Client: optimistic updates (useEntries hook)

**Pattern (required):**

1. **Update UI state immediately** (or via optimistic Zustand/React Query cache) when the user saves.
2. **Fire the API request in the background.**
3. **On success:** reconcile with server response (ids, timestamps if added).
4. **On error:** **revert** optimistic state and show a non-blocking error (toast or inline message).

This preserves the “instant” feel of the local-first MVP while using real network I/O.

Do **not** block the Save button on full round-trip unless validation fails locally.

---

## Auth (NextAuth v5)

- Support **Google** and **email magic link** (provider config in one place; env vars documented).
- After login, **bootstrap** settings and entries from `GET` endpoints; **do not** rely on stale `localStorage` as source of truth.
- Optional one-time migration: on first authenticated load, if `localStorage` has legacy `healthos-data`, offer “Import to account” that POSTs once—then clear local key. **Scope this as optional**; core requirement is server-backed storage for signed-in users.

---

## Environment

Document required env vars in a short `docs/env-backend.md` or comments in `.env.example`:

- `DATABASE_URL`
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- Google OAuth client ID/secret
- Email provider secrets for magic links (e.g. Resend/SMTP)

Never commit secrets.

---

## Scope guard (Phase 2, do not build)

- **No** WebSockets / Supabase Realtime / live subscriptions.
- **No** S3/cloud file storage for photos in this phase—either omit `photoUrl` server-side, keep client-only base64 with size limits, or store a **data URL in DB** only if explicitly allowed (prefer deferring photos to Phase 3).
- **No** multi-tenant admin dashboards, analytics pipelines, or cron jobs unless specified later.
- **No** replacing Next.js with a separate API-only repo.

---

## Deliverables (Phase 2)

1. Prisma schema + migrations.
2. NextAuth configuration and protected Route Handlers.
3. Client hooks (`useEntries`, `useSettings`) with **optimistic updates** and session-aware fetch.
4. Remove or gate `localStorage` persistence behind “logged out demo” or migration path.
5. `README` section: how to run Postgres locally, migrate, and configure OAuth/email.

---

## Quality bar (Phase 2)

- TypeScript strict; no `any`.
- All server entrypoints validate input and enforce `userId` scoping.
- No `console.log` in production paths; errors logged appropriately.
- Idempotent daily upserts aligned with `@@unique([userId, date])`.

---

## Output order (Phase 2)

1. Prisma schema + `User` / `Account` models for NextAuth as required by the adapter.
2. Migrations and seed (optional dev seed only).
3. NextAuth route + middleware (protect `/` or API as needed).
4. API routes (entries, settings) with Zod + `userId` scoping.
5. Client hooks and wire-up of existing components.
6. Docs: env vars + runbook.

Build this like you’re handing off to a team that will run security review next week.
