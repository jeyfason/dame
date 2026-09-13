# Dame Stage 3 — Realtime Play Design Spec

**Date:** 2026-09-07
**Status:** Approved sections 1-4
**Source:** PRD §8.3 + Stages 1-2 on main
**Approach:** A raw DO + Next proxy. Clerk project already initialized. Playwright browser tests required.

## Goal

Live 2-player games on shared authoritative state: create/join, optimistic moves with server confirm, illegal reject + rollback, presence, reconnect grace, game-end broadcast. No clocks, no matchmaking, no ratings.

## Non-goals

Clocks/increment, quick-match queue, Glicko-2, voice, DB persistence of games (finish webhook stub only).

## Architecture

- `worker/` (Cloudflare Workers + Durable Objects, wrangler): `GameRoom` DO per gameId — `GameState` + `history` + `version` + presence. `POST /room` creates (assigns white/black + join tokens), `GET /room/:id/ws` upgrades.
- Next: `POST /api/room` mints gameId + HMAC join tokens (GAME_TOKEN_SECRET), `/play/[gameId]` + `useGameRoom(gameId)` hook (optimistic apply, confirm/rollback, resync, reconnect backoff).
- Shared rules: worker imports `lib/rules` pure functions; DO decision final.

## Protocol

- `join {token, lastVersion}` → `state {state, version}` (+missed moves) + `presence`
- `move {move, baseVersion}` → `state` broadcast or `reject {reason, state, version}` → client rollback + toast
- `presence {you, opponentConnected}`, `end {winner, reason}` on win detect
- Stale baseVersion → reject + snapshot. 120s reconnect grace. 1MB frame cap, malformed → close.

## Auth + Env

- Join: Next-minted HMAC token + Clerk session verify via JWKS in worker.
- Game end: DO POSTs final state to Next `/api/games/finish` (stub stores nothing yet, Stage 4 persists).
  `FINISH_URL` env when set → `ctx.waitUntil(fetch)` `{ gameId, winner, reason, version }`; when unset → no-op (stub path keeps working without network).
- Find values: Cloudflare Dashboard → My Profile → API Tokens → Create (Workers + Durable Objects edit) = CLOUDFLARE_API_TOKEN; URL dash.cloudflare.com/<accountId> = CLOUDFLARE_ACCOUNT_ID.
- `.dev.vars` (never commit): CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, GAME_TOKEN_SECRET=rand-hex-32, CLERK_JWKS_URL, NEXT_PUBLIC_ROOM_WS_URL.

## Testing

Worker vitest: validate accept/reject, stale-version reject, win broadcast, grace resync. Playwright: 2 chromium contexts join same game, move syncs both boards, illegal toasts + rollback, reload rejoins same position. Engine suite stays green.

## Constraints

bun only, no hand package.json edits (worker has own package via bun). No raw hex outside tokens. Prod fail-closed (no bypass). Secrets via env only.

## Success

Two browsers sync <150ms local, illegal rollback, 30s drop resume, worker unit + Playwright green, wrangler dev + deployed verified.
