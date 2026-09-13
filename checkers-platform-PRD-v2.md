# [Codename: Dame] — "Chess.com for Checkers"
## Product & Technical Architecture Document

**Status:** Founding document — ship production-grade from day 1, no throwaway MVP
**Prepared for:** the founding team and engineering
**Owners:** Jeyfason (founder/PM/architect)

---

## 0. How to read this document

This is not a "build a demo" spec. It's written the way a FAANG-level product trio (PM, design, eng lead) would scope a real-time competitive gaming platform before writing code. Every technology choice below is backed by current (2026) research on maturity, pricing, and scale ceiling — not defaults. Treat this document as the source of truth for *what* and *why*; implementation owns the *how*, but architecture decisions here should not be silently overridden — flag it back to the founder if something here turns out to be wrong once building starts.

---

## 1. Vision

Build the definitive online home for checkers (starting with international/dame rules, extensible to other variants later) — the same category-defining role Chess.com plays for chess. Not a side project, not a game jam entry: a real product with accounts, ratings, live multiplayer, and a path to a real business (subscriptions, later tournaments/sponsorships).

**One-line pitch:** *Chess.com, but for checkers, done right from day one.*

## 2. Why checkers, why now

- Checkers is one of the most globally played board games with **no modern, well-designed online home** — the incumbents (e.g. legacy sites) look and feel dated.
- International/Brazilian/Russian checkers variants have large regional player bases that are underserved by polished, real-time platforms.
- The category has a proven playbook: Chess.com and Lichess have already validated that ratings + live play + social features + clean UI is a winning formula for a board game platform — we adapt that playbook rather than inventing a new one.

## 3. Goals & Success Metrics

| Goal | Target / Signal |
|---|---|
| Time-to-first-game | New user can sign up and be in a live match in under 60 seconds |
| Move latency | Sub-150ms perceived move sync between players on a normal connection |
| Uptime | 99.9% for core play path (auth, matchmaking, live game) |
| Rating integrity | Every rated game contributes to a statistically sound rating (Glicko-2, see §7) |
| Retention signal | D1/D7 return rate of players who complete at least one rated game |
| Fair play | Automated flagging of anomalous move-timing/accuracy patterns (basic anti-cheat, see §9) |

## 4. Non-Goals (explicitly out of scope for launch, not "cut corners")

- Native iOS/Android apps at launch (responsive PWA-quality web first; native wrapper is a fast-follow once product-market fit is clearer, not a v1 blocker).
- Real-money wagering or paid tournaments at launch (subscriptions/cosmetics are the initial monetization path; gambling mechanics need legal review first).
- Other checkers variants beyond international rules at launch (English/American 8x8 draughts, Russian, Brazilian — planned, sequenced post-launch).
- AI opponent / bot play at launch (this doc is scoped to human-vs-human; a bot ladder is a natural fast-follow and the rules engine should be built so a bot can plug into it later without rework).

## 5. Target Users & Core Use Cases

- **Casual social players**: invite a friend, jump into a game, chat/voice while playing.
- **Ladder-climbers**: care about rating, want fair matchmaking against similarly-rated strangers, want a leaderboard to chase.
- **Spectators/community** (post-launch): watch top players, follow rivalries — deferred, but the data model (games, ratings, profiles) should not preclude it later.

## 6. Core Product Requirements

### 6.1 Gameplay
- International checkers (10x10, flying kings, mandatory captures, mandatory multi-jump completion) as the launch ruleset, built as a pluggable rules engine so additional variants are new rule modules, not rewrites.
- No hints, no undo, no move suggestions in rated play. Casual/unrated "friends" games may later get relaxed rules (analysis, rematch) — rated ladder play stays strict.
- Optional clocks: preset time controls (e.g. Bullet/Blitz/Rapid/Classical style buckets, mirroring the format chess platforms use, since checkers players will recognize the mental model) plus a custom option, with optional per-move increment.

### 6.2 Matchmaking & Play Modes
- **Play a friend**: invite link/code, choose time control, instant start.
- **Quick match / ladder**: rating-based matchmaking against strangers within an expanding rating band (widen the band the longer the queue waits, standard approach for fair, fast matchmaking).
- **Rematch** and **new opponent** flows from the post-game screen.

### 6.3 Accounts, Profiles, Social
- Auth via **Clerk** (see §8) — email, social login, and passkey support out of the box.
- Profile: display name, avatar, country flag (optional), bio, rating(s) per time control, win/loss/draw record, join date.
- Friends list, online-status presence, direct invite.

### 6.4 Rating & Leaderboard
- **Glicko-2** rating system per time-control pool (see §7) — this is what Chess.com, Lichess, and most modern competitive platforms use because it adapts faster for new/inactive players than flat Elo, which matters for a growing user base.
- Global and friends-filtered leaderboards, per time control.
- Full match history with final board state; live game replay (step through recorded moves) is a strong v1.1 target, not a hard launch blocker.

### 6.5 "Playing together" / social-presence layer
- Low-latency **voice chat** during matches (see §8) — this is the platform's differentiator vs. legacy checkers sites, so it should feel first-class, not bolted on.
- Lightweight text chat + emote/reaction shortcuts as a fallback when voice is off or unavailable.
- Live presence: "opponent is thinking," typing/reaction indicators, reconnect-and-resume if a connection drops mid-game.

### 6.6 UI/UX bar
- Professional, premium visual identity — not a generic AI-template look. Custom design system (see design system note in §10), satisfying animation/sound for moves, captures, promotions, wins.
- Fully responsive: desktop, tablet, mobile browser, from day one (this is a requirement, not a stretch goal, given "cross-device" is core to the vision).

## 7. Rating System — Glicko-2 (researched choice)

Glicko-2 (Mark Glickman, 1995/2001) improves on classic Elo by tracking not just a rating but a **rating deviation (RD)** — the system's confidence in that rating — plus a volatility measure. New and returning players' ratings move faster until the system is confident; established, consistent players are protected from single-game swings. It's the system used by Chess.com, Lichess, and most competitive online game platforms today (Pokémon Showdown, OGS, Splatoon, and others), so it's a proven, well-understood choice rather than a novel bet — and players coming from chess platforms will already have the right mental model for how their number moves.

Implementation notes for the agent:
- Maintain a separate rating pool per time-control bucket (players are used to this from chess platforms — "my blitz rating" vs. "my rapid rating").
- Update ratings per-game (not batched), which is the modern convention (Lichess does this; the original Glicko-2 spec assumed batched "rating periods," but per-game updates with a short effective period are standard practice now).
- New/unrated players start at 1500 with a high RD so their rating moves quickly toward their true strength in their first ~10-15 games.
- Store rating history so profile pages can show a rating-over-time graph.

## 8. Technology Stack (researched, with rationale)

This is a real-time, stateful, competitive product — the stack should be chosen for correctness and low latency under load, not developer convenience alone. Recommendations below, with the reasoning, so the agent (or you) can substitute if something changes by build time — always re-verify current pricing/limits before committing, since this space moves fast.

### 8.1 Auth — Clerk (confirmed choice)
Clerk is a strong fit for a fast-moving product team: prebuilt, polished auth UI components, session management, social login, and native passkey support, so the team isn't hand-rolling auth flows. Its free tier is generous (tens of thousands of monthly active users before paid tiers kick in) and pricing scales predictably with usage into the mid-hundreds of dollars/month at meaningful scale — reasonable for a pre-revenue product, with a clear upgrade path (Pro, then Business for SOC 2/compliance needs) once the product has real usage. **Action item:** confirm current published pricing tiers directly on Clerk's pricing page before committing budget, since tiers/limits shift.

### 8.2 Transactional email — Resend (confirmed choice)
Resend is the modern, developer-first choice here specifically because it's built around **React Email** — templates as real React components, which fits a React-based product and avoids maintaining brittle HTML-string email templates. It's the right choice over legacy providers like Nodemailer/raw SMTP (fragile, no deliverability infrastructure) for anything the product actually depends on — password resets, match invites, rating-milestone notifications, weekly digest emails. Its free tier and entry paid tier comfortably cover early-stage volume. **Trade-off to know:** Resend is newer than SendGrid/Postmark and has a shorter track record at very high volume — fine at launch scale, worth revisiting only if/when the product is sending millions of emails/month.

### 8.3 Real-time game sync — Cloudflare Durable Objects (+ PartyKit) — recommended
This is the most important architecture decision in the whole document, so it gets the most detail.

**Recommendation: one Durable Object per active game room**, using Cloudflare's Durable Objects platform (optionally via the PartyKit framework, which is built specifically on top of Durable Objects and simplifies the "one stateful room per game" pattern).

Why this over a traditional Node/Socket.IO server fleet:
- Durable Objects give you **exactly one authoritative, strongly-consistent instance per game room**, addressable by a stable ID — which is precisely the coordination model a turn-based game needs (no risk of two server instances disagreeing about board state, which is a real failure mode with naively load-balanced WebSocket servers).
- They run on Cloudflare's edge network, so a room is created near the players connecting to it, keeping round-trip latency low without you manually managing regional server fleets.
- Billing is based on active-request wall-clock time, which is naturally cost-efficient for a turn-based game (a checkers game generates far less continuous traffic than a fast-twitch action game — you're not paying for constant tick-rate simulation).
- This is now a well-established pattern for exactly this use case (turn-based multiplayer games, chat rooms, collaborative apps) — it's a proven approach, not a leading-edge gamble.

**The authoritative server model matters for a real product:** unlike a quick single-file prototype, this architecture validates every move **server-side inside the Durable Object**, not just client-side — this is what a real competitive platform needs to prevent cheating and desync, and it's the correct trade-off now that we're not constrained to a single static file.

**Practical shape:**
- Client connects via WebSocket to a Worker, which routes to the game's Durable Object (looked up by game ID).
- The Durable Object holds the authoritative board state, the shared rules-engine logic (same validation logic should be shared/mirrored on the client for instant optimistic local feedback, but the DO's decision is final), the clock state, and move history.
- On disconnect, the Durable Object persists state and allows reconnection within a grace period; on game end, final state is written to the primary database (see §8.4) for permanent history/rating updates.

**Alternative considered:** a traditional managed WebSocket service (e.g. Socket.IO cluster on your own servers, or a hosted alternative). Rejected as the primary choice because it pushes the "which server owns this room's authoritative state" problem back onto you to solve manually (sticky sessions, Redis pub/sub for cross-instance coordination) — solvable, but it's solving a problem Durable Objects already solve natively. Keep this as a fallback option if the team has strong existing Node/Socket.IO expertise and wants to avoid a new platform's learning curve.

### 8.4 Primary database — Postgres (managed, e.g. Neon or Supabase) — recommended
- Accounts (mirrored from Clerk), profiles, match history, rating history, and leaderboard data are all relational, well-structured data — Postgres is the right default, not a NoSQL store.
- A serverless-friendly managed Postgres (Neon, Supabase, or similar) fits well alongside an edge-first real-time layer, avoiding a mismatch between "edge-native game sync" and "traditional always-on database connection pool" — confirm current connection-pooling story (e.g. via PgBouncer or the provider's built-in pooler) when the agent scaffolds this, since edge functions and long-lived DB connections don't naturally mix.
- Leaderboard reads (e.g. "top 100 by rating") are a good candidate for a cache layer (Redis, or the provider's built-in caching) once traffic justifies it — not needed at launch scale, but the schema should be designed so adding a cache later doesn't require a rewrite.

### 8.5 Voice chat — LiveKit — recommended, with a clear cost/scale note
- **LiveKit** (open-source WebRTC SFU, also available as a managed cloud service) is the recommended choice for in-match voice: it's the current category leader for this kind of embedded real-time voice (it powers voice features at major consumer AI and communication products), has a genuinely usable free tier for early development/launch, and — critically — gives you an **open-source self-host escape hatch** if usage grows enough that managed per-minute pricing becomes expensive, without a full re-architecture.
- For a 1-on-1 checkers match, a direct peer-to-peer WebRTC connection (no SFU needed) is technically simpler and cheaper — but routing even 1:1 calls through LiveKit from day one buys you TURN/NAT-traversal handling, reconnection logic, and a straightforward upgrade path to group voice (e.g. for future spectator rooms or team events) without re-building the voice layer later. **Recommendation: start with LiveKit's managed cloud for simplicity, revisit self-hosting only if per-minute costs become a meaningful budget line at scale.**
- **Action item:** get current LiveKit Cloud pricing tiers directly before committing — this space (WebRTC-as-a-service pricing) has moved quickly and multiple credible competitors exist (e.g. Daily, 100ms) worth a quick comparison at build time.

### 8.6 Frontend
- React (Next.js) — pairs cleanly with Clerk's SDK, Resend's React Email templates, and the broader ecosystem's tooling; also the most defensible choice for hiring/agent-familiarity given how much of the current tooling (Clerk, PartyKit, Durable Objects skills) is React/TypeScript-first.
- Design system: build a small custom component/design-token library from day one rather than an off-the-shelf UI kit's default look — this directly serves the "not generic AI-template" visual bar in §6.6. (See `frontend-design` guidance for tokens/typography direction when the agent starts implementation.)

### 8.7 Observability, deploys, and "boring but necessary" infra
A real product needs these from day one, not as an afterthought:
- **Error tracking** (e.g. Sentry) wired in from the first deploy — silent client-side game-sync bugs are exactly the kind of thing that will otherwise only surface as angry users.
- **CI/CD** on every push (typecheck, lint, test, deploy previews) — non-negotiable for a team using coding agents heavily, since agent-written code needs the same gate as human-written code.
- **Feature flags** (even a simple in-house one backed by the database) so risky changes to the live game engine can be rolled out gradually.
- **Status page** — competitive gaming platforms live and die on perceived reliability; a public status page is cheap insurance for trust.

## 9. Fair Play / Anti-Cheat (v1-appropriate, not theoretical)

- All moves validated server-side in the authoritative Durable Object — never trust the client (see §8.3). This alone rules out the most naive cheating vector (a modified client claiming an illegal move happened).
- Basic behavioral signals worth logging from day one even if not acted on immediately: suspiciously consistent move timing, move accuracy inconsistent with self-reported rating, use of the same device/IP across accounts. Full engine-assisted-cheat detection (comparing a player's moves against an optimal-play solver) is a real feature category worth revisiting once there's a rated ladder with something worth protecting — flag as a fast-follow, not a launch blocker, but design the move-log schema now so that analysis is possible later without a data migration.

## 10. Design & Brand Direction

- The product needs its own visual identity — not "chess.com's color palette with checkers pieces." Define this deliberately: typography, color system, piece/board art style, motion language, sound identity.
- "Fun but professional" (per the founder's brief): premium polish and legible seriousness (this is a competitive ladder, players should feel their rating means something) combined with delightful, non-childish moments of personality (satisfying capture/promotion animations, a distinctive win/loss screen) — avoid both "corporate SaaS dashboard" sterility and "mobile hypercasual game" cheapness.

## 11. Suggested Build Sequence

Not "MVP then iterate" — this is "ship the real thing in stages," each stage production-quality:

1. **Foundations**: repo, CI/CD, Clerk auth, Postgres schema (users, profiles), design system skeleton.
2. **Core rules engine**: international checkers rules, fully tested (this is the one piece of logic that must be bulletproof — build a strong automated test suite against known rule edge cases before anything else depends on it).
3. **Real-time play**: Durable Object game rooms, WebSocket client, live board sync, reconnection handling, server-side move validation.
4. **Ratings & matchmaking**: Glicko-2 implementation, rating pools per time control, quick-match queue, leaderboard.
5. **Social/"together" layer**: LiveKit voice integration, chat, presence, friend invites, Resend-powered transactional emails (invites, notifications).
6. **Polish & launch readiness**: animation/sound pass, responsive QA across devices, Sentry + monitoring live, status page, load testing the Durable Object room model under concurrent-game load.

## 12. Working Model

- The founding team stays the product/architecture owner — research, spec, and course-correction live here.
- Implementation work happens inside each build-sequence stage, using this document plus stage-specific specs as its brief.
- Any deviation from this architecture discovered during build (e.g. a chosen provider's pricing or limits changed, a technical assumption doesn't hold) should be surfaced back for a decision, not silently patched around — this keeps the founding team in control of the product's technical direction.

---

*This document reflects research current as of September 2026. Pricing, feature sets, and competitive alternatives for third-party services (Clerk, Resend, LiveKit, Cloudflare) should be re-verified at the point of actual implementation, since this market moves fast.*
