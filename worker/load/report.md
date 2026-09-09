# Load report — Stage 6 Task 4

Script: `worker/load/run.ts` (bun only). N=100 clients across M=50 games,
random legal moves via the engine (`legalMoves`), per-move WS round-trip
(send `move` → `state`/`reject`), p50/p95 + reject rate.

## How to run

```bash
# terminal 1: local worker (secret stays in the shell, never committed)
cd worker && bun x wrangler dev --local --port 8787 \
  --var GAME_TOKEN_SECRET:$(openssl rand -hex 32) --var E2E_BYPASS_AUTH:1
# terminal 2:
bun worker/load/run.ts --games 50 --moves 20 --batch 10 --url http://localhost:8787
```

Games run in batches of 10 (20 concurrent sockets) so single-threaded local
workerd survives the burst; totals are still 100 clients / 50 games / 1000 moves.

## Results (2026-09-09, wrangler 4.129 dev --local)

| run | n | p50 | p95 | avg | max | rejects | finished | wall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| burst 50 games × 20 moves | 1000 | 206.5ms | **330.7ms** | 335.6ms | 5695ms | 0 (0%) | 0/50 | 43.0s |
| unloaded 3 games × 20 moves | 60 | 24.0ms | **41.3ms** | 26.0ms | 55.3ms | 0 (0%) | 0/3 | 2.1s |
| in-process decideMove (no socket) | 1000 | 0.04ms | **0.25ms** | 0.12ms | 7.4ms | 0 (0%) | 0/50 | 0.15s |

Target p95 <150ms local: **PASS unloaded, FAIL under burst.**
Game logic is negligible (engine p95 0.25ms); the burst floor is local
workerd emulation (inspector proxy + per-move SQLite `persist()` in the DO,
cold-handshake 3–4s). Production DOs have faster storage; re-prove against
staging before launch. 20 random moves never finish a checkers game
(finished=0 expected); moves are sequential per game so 0% rejects is
expected — no contention is exercised by design.

## Backlog (not cheap → TODO tickets)

- TODO: crash-between-`saveRating`-and-`addHistory` double-apply guard
  (`lib/ratings/update.ts` TODO) — needs a multi-statement txn (unavailable
  on neon-http) or an idempotency guard + **live-DB** test.
- TODO: live-DB finish test (unmocked `POST /api/games/finish` vs Postgres;
  no `DATABASE_URL` in this env) — covers PK-conflict retry + history
  idempotency for real.
