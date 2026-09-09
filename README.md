This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Realtime Worker (Stage 3)

`worker/` is a Cloudflare Worker + `GameRoom` Durable Object (one per gameId).
Local dev: `cd worker && bun x wrangler dev --local` (needs `.dev.vars`, never commit it).

### Where to find Cloudflare credentials

- **Account ID**: open [dash.cloudflare.com](https://dash.cloudflare.com) — the ID is in the
  dashboard URL (`dash.cloudflare.com/<ACCOUNT_ID>`) and on the Workers overview page.
- **API token**: Dashboard → **My Profile → API Tokens → Create Token**.
  Grant **Workers (edit)** + **Durable Objects (edit)**. Use it as `CLOUDFLARE_API_TOKEN`
  (via `wrangler login` or env — never commit it).

### `.dev.vars` template (copy to `worker/.dev.vars`, git-ignored)

See `worker/.dev.vars.example`:

```ini
GAME_TOKEN_SECRET="replace-with-rand-hex-32"
CLERK_JWKS_URL="https://<your-clerk-domain>/.well-known/jwks.json"
CLOUDFLARE_ACCOUNT_ID=""
CLOUDFLARE_API_TOKEN=""
NEXT_PUBLIC_ROOM_WS_URL="ws://localhost:8787"
```

Generate the secret with `openssl rand -hex 32`. Deploy secrets with
`wrangler secret put GAME_TOKEN_SECRET` (never in code or git).

### Create-game URL flow (no new UI)

- `POST /api/room` (Clerk session required; `E2E_BYPASS_AUTH=1` only outside
  production) → `{ gameId, tokens: { white, black }, wsUrl }`.
- `GET /api/room?gameId=<id>&role=white|black` → `{ gameId, role, token, wsUrl }`.
- Open `/play/<gameId>?role=white` and `/play/<gameId>?role=black` — the page
  fetches its role token via `GET /api/room` then joins
  `${NEXT_PUBLIC_ROOM_WS_URL}/room/<gameId>/ws`.
- Worker parity: `POST /room` (same Clerk gate) mints both tokens;
  `GET /room/<gameId>/ws` upgrades. Game end POSTs `{ gameId, winner, reason,
  version }` to `FINISH_URL` when set (else no-op); Next stub
  `POST /api/games/finish` logs + returns 200 (Stage 4 persists).

## Launch checklist (Stage 6 Task 4)

- [ ] Env: copy `worker/.dev.vars.example` → `worker/.dev.vars`
  (git-ignored); set `GAME_TOKEN_SECRET` (`openssl rand -hex 32`),
  `CLERK_JWKS_URL`, `NEXT_PUBLIC_ROOM_WS_URL`; web `.env.local` needs
  `DATABASE_URL`, Clerk keys, `NEXT_PUBLIC_SENTRY_DSN`.
- [ ] Migrate: `bun x drizzle-kit push` (applies `drizzle/*.sql`:
  ratings, history-unique, social, friendships-unordered).
- [ ] Flag seed: insert `feature_flags` rows (`voice` off by default;
  `getFlag` fails closed when `DATABASE_URL` is unset).
- [ ] Secrets: `wrangler secret put GAME_TOKEN_SECRET` (+ `CLERK_JWKS_URL`
  as a var); never commit `.dev.vars` or real values.
- [ ] Deploy worker: `bun x wrangler deploy --config worker/wrangler.toml`;
  smoke `GET /health` + one WS join/move on the deployed URL.
- [ ] Deploy web: `bun run build` green, then deploy; smoke `/api/status`
  (db + worker pings) and `/status` page.
- [ ] Sentry confirm: hit `/api/sentry-test` (dev-gated) and verify the
  event + release appears in the Sentry dashboard.
- [ ] Load: `bun worker/load/run.ts` passes p95 <150ms vs staging
  (local burst p95 ~331ms under workerd emulation — see
  `worker/load/report.md`; re-prove against staging before launch).
