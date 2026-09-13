# Dame UI/UX Revamp — Design Spec

**Date:** 2026-09-09
**Status:** Approved by founder (all sections)
**Scope:** Whole-site visual revamp + rules fix + game-UX overhaul + live deployment
**Direction:** Classic premium — warm walnut board, cream/jet pieces, aged brass accent, deep forest felt surfaces

## Goal

Make Dame look and feel like a real, premium board game and ship it live: fix the illegal backward-move rule, replace toast-based error feedback with in-board physical feedback, redesign branding (colors, type, pieces, board, motion), restructure every page, and deploy to the existing Cloudflare stack.

## Non-goals

- No new game variants (international 10x10 stays the only ruleset)
- No matchmaking/ladder queue, spectating, LiveKit voice join (flag stays off)
- No account/settings redesign beyond tokens; Clerk hosted pages stay as-is
- No new backend features; worker/DB/ratings logic untouched (rules fix is engine-only)

## 1. Rules fix (engine)

`lib/rules/international.ts` quiet moves for men currently allow all 4 diagonal directions (documented "§6.1 deviation"). Strict FMJD international draughts: men's quiet moves are **forward-diagonal only**; captures are already bidirectional and stay that way.

Change: in `quietMoves()`, men generate quiet moves only in their forward direction (white toward row 0, black toward row 9). Kings unchanged (all 4 dirs, sliding). Mandatory-capture majority rule, flying kings, promotion-on-back-rank (which ends capture sequences), and win detection all unchanged.

Test updates: `moves.test.ts`, `initial.test.ts`, `final-review.test.ts` — replace the backward-quiet-step regression cases with forward-only assertions (man cannot step backward; can still capture backward). PRD/design-doc deviation notes get corrected.

Downstream safety: worker, ratings, DB persist moves verbatim; no schema or protocol changes.

## 2. Game UX — in-board feedback (no toasts in gameplay)

All feedback is physical and on the board. sonner stays only for the invite copy action on `/play/join`.

### Interaction model (LocalBoard + online game page share one behavior spec)

- **Tap own piece with legal moves:** piece lifts (scale ~1.06 + shadow), legal destinations show glowing brass dots, capture destinations show a stronger ring.
- **Tap a destination:** piece slides (180ms). Captured pieces "pop" (scale up briefly, fade out) — knocked-off feel.
- **Tap invalid target (empty/own-blocked/illegal):** square shakes (~3px horizontal, ~250ms) + brief terracotta flash. No text popup.
- **Tap a piece that cannot move while captures are mandatory:** the piece that must capture pulses brass — teaches the majority-capture rule instead of scolding.
- **Not your turn (online):** board slightly dimmed, turn plaque shows "Opponent's turn" with pulsing dot; taps give the gentle shake only.
- **Promotion:** gold crown burst on the promoted square (expanding ring + crown fade-in).
- **Last-move trail:** from/to squares of the latest move stay subtly highlighted until the next move.

### State surfaces

- **Player plaques** above/below the board (chess.com-style): color chip, captured-piece count, name (online) or White/Black (local). Active player's plaque elevated/glowing; inactive dimmed.
- **Game end:** full board overlay — dimmed board, large result ("White wins" / "Black wins"; draw detection is not in the engine, so no draw state this pass), with Rematch (swap colors) + New opponent buttons (online) or Play again (local). Slides up 220ms.
- Move counter + captured tray under each plaque (local: simple counts; online: real captured pieces).

### Deletions

All `toast.error(...)` in `LocalBoard.tsx` and `app/play/[gameId]/page.tsx` (turn guard, illegal piece, illegal square cases). The join-error/loading screens on the game page become styled states of the same layout, not raw text blocks.

### Sound

Existing move/capture/win synth stays; add a low "thud" for invalid/shake. All behind the existing sound toggle and `isSoundEnabled()`.

### A11y (preserve existing guarantees)

`data-testid` contract stays stable: `square-{r}-{c}`, `piece-{r}-{c}`, `dest-{r}-{c}`, `turn-label`, `winner-banner`, `reset-button`, `move-announcement`, `board`. aria-live move/selection announcements stay; new visual states (shake, pulse, dot) also get aria text where they convey state (e.g. "must capture" announcement). Keyboard play (arrows + Enter) unchanged. `prefers-reduced-motion` collapses all new motion to opacity-only or none.

## 3. Branding & visual system

### Tokens (replace `app/dame-tokens.css` entirely)

```
--board-light: #E8D5B0   warm maple light squares
--board-dark:  #A9713F   walnut dark squares
--board-frame: #3E2A1E   espresso frame, beveled inner edge
--piece-white: #F7F1E3   cream, layered shadows for ridged depth
--piece-black: #1C1B18   jet with specular highlight
--accent:      #C9A227   aged brass — selection, focus, kings, primary buttons
--felt:        #23301F → #1A2418  page background, radial vignette
--surface:     #2A3327 / #222B20  cards/panels
--text:        #F2EDE3
--text-muted:  #9BA694
--danger:      #D05B4C   invalid flash
```

No raw hex in components — all via CSS vars (existing rule stands). Dark/light theme split: the premium felt look IS the theme; `next-themes` remains but both themes share this identity (light theme = same felt family, slightly lifted).

### Typography (next/font, self-hosted)

- Display/headings/wordmark: **Fraunces** (high-contrast serif)
- Body/UI: **Outfit** (geometric sans)
- Board coordinates (a–j, 1–10) in Outfit, small caps, low opacity, on the frame.

### Pieces & board

- Pieces: pure CSS — radial-gradient body, inset shadows, concentric ring grooves; king gets engraved brass crown mark. Hover lift on own pieces.
- Board: espresso frame with beveled inner edge, subtle SVG-noise grain on squares, rounded corners, ambient shadow, coordinate labels on the frame.

### Motion scale (`dame-motion`)

slide 180ms ease-out · shake 250ms · plaque glow 300ms · overlay 220ms · lift 120ms. One shared reduced-motion path.

### Logo

"Dame" wordmark in Fraunces with a small brass disc-dot over the "a" (SVG/CSS, no image asset).

### Design-system doc

`design-system/DAME/MASTER.md` is rewritten to match this system (its current purple/neon spec was never applied and now contradicts reality).

## 4. Page-by-page structure

- **Landing `/`:** hero with wordmark + live mini-board (scripted 4-move capture sequence auto-looping, real board component at small size); three feature rows (Live rated matches / Invite links / Glicko ladder) with brass icons; brass "Play now" → `/sign-up`, ghost "Quick match" → `/play`; minimal footer.
- **`/play`:** two mode cards (Play a friend → invite flow, Local pass-and-play), then the local board with plaques + overlay; one screen, no desktop scroll.
- **`/play/join`:** two felt cards (create invite / join with code); big brass code display; copy keeps sonner toast; after minting show "Open as White" + share link together.
- **`/play/[gameId]`:** centerpiece. Opponent plaque above board, yours below (board flips for black perspective); chat right rail on desktop, collapsible below on mobile; header: small wordmark, game id chip, sound toggle, connection dot; rematch/new-opponent in the end overlay; VoiceBar stays flag-gated off. Note: board-flip for black is presentational (CSS transform of the square grid) — engine coordinates unchanged, so testids keep board-space r/c mapping (tests always play from white perspective).
- **`/leaderboard`:** felt table, brass medals top 3, avatar+rating chips, online dots, segmented All/Friends control.
- **`/profile/[id]`:** card header (avatar/name/country/joined), rating tiles, history list, "Challenge friend" when friendship exists.
- **Shell/nav:** sticky top nav (wordmark, Play, Leaderboard, Profile, UserBadge); mobile bottom tab bar (Play/Leaderboard/Profile); felt background, one max-w container.

## 5. Deploy & launch

Environment already configured (Cloudflare workers live, Neon DB working, `.env.local` populated). Path:

1. Engine fix + revamp on main; `typecheck` + `lint` + `vitest` + Playwright all green (E2E updated for shake-assertions instead of toasts; testids stable so churn is minimal).
2. `bun run build` (OpenNext) green.
3. Deploy web via existing Cloudflare pipeline (worker already live).
4. Smoke: `/api/status` green; invite → join → play 3 moves → finish → leaderboard updates; Sentry test event.
5. Tag version.

Deploy mechanics stay as-is (existing wrangler.jsonc + OpenNext flow); this spec ships code, not pipeline changes. If the existing deploy command differs day-of, run it unchanged — the launch gate is a green build + passing smokes, not a new pipeline.

## 6. Rollout order (implementation sequencing note)

The revamp is large; it lands in dependency order within one spec/plan: (a) engine rules fix first (isolated, test-locked), (b) token system + Shell/nav + typography (site-wide base), (c) board/pieces/plaques/overlay components (game feel), (d) page-by-page rebuilds using (b)+(c), (e) E2E updates + deploy. Each step keeps gates green so the app is deployable at any commit.

## Testing strategy

- Unit: forward-only quiet moves, backward capture still legal, existing majority/promotion/king suites stay green.
- Component: plaque active state, shake on invalid, overlay on win, king burst, no toast on invalid (assert absence).
- E2E (Playwright): updated flows — landing, local play incl. invalid-shake, invite/join/multi-move/finish/rematch, leaderboard.
- Final: `verify` pass driving the real deployed/dev game end to end.

## Success criteria

1. Men cannot step backward (strict FMJD); all rule tests green.
2. Zero toasts during gameplay; invalid input always produces in-board physical feedback.
3. New visual identity applied site-wide; no raw hex in components.
4. All quality gates green; game deployed and playable end-to-end on the live URL.
