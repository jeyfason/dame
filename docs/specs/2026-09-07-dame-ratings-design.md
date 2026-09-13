# Dame Stage 4 — Ratings + Invites Design Spec

**Date:** 2026-09-07
**Status:** Approved sections 1-4
**Source:** PRD §6.2-6.4 + §7 + Stages 1-3 on main
**Approach:** A pure-TS Glicko-2 + games tables. Single pool now. Friend invites first.

## Goal

Rated games end-to-end: persist results, update Glicko-2 ratings, invite-a-friend entry, rematch, leaderboard + profile history. No clocks, no ladder queue (next).

## Non-goals

Time-control pools, quick-match queue/expanding band, voice, draw offers.

## Data model

- `games(id uuid pk, white_clerk_id, black_clerk_id, winner white|black|draw|null, reason, moves jsonb, created_at, finished_at)`
- `ratings(clerk_id pk, rating 1500, rd 350, vol 0.06, games_played 0, updated_at)`
- `rating_history(id uuid pk, clerk_id, game_id, rating, rd, at)`
- `invites(code pk, host_clerk_id, game_id uuid, expires_at, used_at null)`
- Migration `drizzle/0002_ratings.sql`. Pool column deferred to clocks stage.

## Glicko-2

`lib/ratings/glicko2.ts` pure per Glickman: tau 0.5, eps 1e-6, scale 173.7178. `update(player, [{rating, rd, score}])`. Per-game single opponent. Finish route: auth (worker HMAC or Clerk), validate, insert game + 2 history rows + update ratings in transaction, return deltas. Tests vs published example ±0.1.

## Invites + board flows

- `POST /api/invites` → code + gameId (worker room minted server-side with host as white).
- `/play/join?code=` redeems (expiry + single-use), fetches guest token, redirects game.
- Post-game: rematch (new gameId, swapped roles) + new-opponent (lobby).
- Leaderboard top 100 rating desc with RD shown; profile rating + W/L/D + history points.

## Testing

Vitest: Glicko-2 vectors, rating update integration (new swings wide, established narrow), invite redeem/expiry/double-use, finish idempotency (same gameId twice = one game). Playwright: host creates invite → guest joins → play → finish → leaderboard shows both. Engine + worker suites green.

## Constraints

bun only; fail-closed auth (finish requires worker secret or Clerk; invites Clerk-only); no secrets committed; idempotent finish.

## Success

Persist + deltas correct, invite→join→rematch works, leaderboard + history live, suites green.
