# Dame Foundations — Stage 1 Design Spec

**Date:** 2026-09-07
**Status:** Approved sections 1-5 by founder
**Source:** `checkers-platform-PRD-v2.md` §11 Stage 1
**Stack lock:** Next.js App Router + TypeScript + Clerk + Neon Postgres + Drizzle + Tailwind + shadcn + Vercel + bun + Sentry

## Goal

Ship production-grade foundations that unlock Stages 2-6 without rework: repo + CI/CD + auth + users schema + Dame design-system skeleton + responsive shell.

## Non-goals for this stage

- No rules engine (`lib/rules/` reserved empty), no Durable Objects, no matchmaking, no Glicko-2, no LiveKit, no Resend templates. Schema adds `users` + `feature_flags` only.

## Architecture

Next.js 14+ App Router (strict TS) deployed on Vercel. Clerk middleware protects `/play`, `/profile/*`. Neon Postgres accessed via Drizzle + HTTP driver (Neon serverless driver) for edge-safe queries, migrations in `drizzle/`. UI: Tailwind + shadcn primitives in `components/ui`, custom Dame identity in `components/dame` + `app/dame-tokens.css`. CI: GitHub Actions (typecheck, lint, test) + Vercel previews. Sentry wired client + server from first deploy. Simple DB-backed feature flags in `lib/flags`.

File boundaries:
- `app/` — routes thin, Server Components only for data reads
- `lib/db/schema.ts`, `lib/db/client.ts` — sole DB owners
- `lib/auth/*` — Clerk helpers
- `lib/flags/*` — flag reads
- `components/ui/*` — shadcn only, no Dame hex
- `components/dame/*` — brand components
- `drizzle/` — SQL migrations
- `design-system/DAME/MASTER.md` — persisted tokens

## Components

Routes:
- `/` landing explaining 60-sec to first game, CTA to sign-up
- `/sign-in`, `/sign-up` Clerk hosted components
- `/play` auth-gated shell with empty board placeholder + “engine lands Stage 2” empty state
- `/profile/[id]` displayName, avatar, country flag, bio, join date, placeholder rating pools

Schema v1:
- `users(id uuid pk, clerk_id text unique not null, display_name text, avatar_url text, country text, bio text, created_at timestamptz, updated_at timestamptz)`
- `feature_flags(key text pk, enabled boolean, rollout_pct int)`

Design skeleton:
- shadcn: Button, Card, Dialog, Avatar, Input, Label, Sonner/toast
- Dame tokens: felt greens/charcoal, ivory/ebony pieces, gold/teal accent, display font + Inter body, spacing 16-64 default, motion 150-250ms UI. No raw hex in components, all via CSS vars.
- Requirements: base 16px, lh 1.5, contrast 4.5:1, 44x44 touch, mobile-first, no horizontal scroll, SVG Phosphor/Lucide icons, keyboard nav + focus rings.

## Data flow

1. User hits protected route → Clerk middleware → sign-in with `redirect_url`
2. Clerk webhook `POST /api/webhooks/clerk` (svix verify) → idempotent upsert on `clerk_id` → `users` row
3. Server Components call `auth()` + Drizzle read, never expose DATABASE_URL to client
4. Flags read server-side, cached 30s, default OFF on error

## Error handling

- Webhook: verify signature, return 400 on bad sig, 500 + Sentry on DB fail (Clerk retries)
- Auth: expired session → sign-in redirect, preserve destination
- DB down: play/profile show empty-state + retry, landing stays static
- Flags fail closed

## Testing

- `tsc --noEmit`, `eslint`, `vitest` (flags/utils), Playwright smoke: landing loads, sign-up redirects to `/play`, profile renders
- CI gate blocks merge on fail. Sentry test event on first prod deploy.

## Global constraints (carry to plan)

- Package manager: bun only. Install via `bun add`, `bunx`. Never hand-edit `package.json` or `bun.lock`.
- UI: shadcn + Tailwind + custom Dame tokens. No generic template look. Use ui-ux-pro-max `--design-system --persist` to generate MASTER.md.
- DB: Neon with pooling/HTTP. Branch per preview env.
- Deploy: Vercel previews + production. Env: `NEXT_PUBLIC_CLERK_*`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `DATABASE_URL`, `NEXT_PUBLIC_SENTRY_DSN`.
- Re-verify Clerk/Neon pricing before scale.

## Success criteria

1. `bun dev` serves responsive landing + auth + play shell
2. New signup → `/play` under 60s, `users` row exists
3. Flags toggle without redeploy
4. CI green, Vercel preview link, Sentry live
5. MASTER.md persisted

## Open for Stage 2

`lib/rules/international.ts` interface reserved. Games/ratings/history schema deferred to Stage 4.
