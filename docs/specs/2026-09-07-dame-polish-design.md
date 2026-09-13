# Dame Stage 6 — Polish + Launch Readiness Design Spec

**Date:** 2026-09-07
**Status:** Approved sections 1-4
**Source:** PRD §11 Stage 6 + Stages 1-5 on main
**Approach:** A polish sweep + launch gates. framer-motion for game motion. Voice join after cost review.

## Goal

Ship-quality feel + proven launch gates: motion/sound, responsive + a11y, Sentry live, status page, local load proof, launch checklist. No LiveKit join.

## Non-goals

LiveKit audio, ladder queue, spectator, real-money anything.

## Motion + Sound (framer-motion)

- `bun add framer-motion`: piece `layout` slides 180ms, `AnimatePresence` capture fade/scale + win spring, `useReducedMotion` → instant.
- `lib/sound.ts` WebAudio synth (move/capture/win), `SoundToggle` localStorage, default on, starts on first gesture.
- Tests: reduced-motion render test, sound toggle test.

## Responsive + A11y

- Viewport matrix Playwright (360/768/1280): no-x-scroll, board fit, chat stacked mobile, 44px.
- Board buttons with aria-labels, `aria-live` move announcements, focus rings, full keyboard play both boards.

## Ops

- Sentry: dev-gated test-event route, `SENTRY_RELEASE` tag, source maps on build.
- `GET /api/status` (db + worker ping + version) + `/status` page 60s refresh.
- `worker/load/run.ts`: N clients × M games, p50/p95 + rejects; target 50 games p95 <150ms local.
- Backlog if cheap: crash-after-save delta snapshot, live-DB finish test; else ticket.

## Testing

Vitest motion/sound/status, Playwright matrix + keyboard + status page, load script report committed.

## Constraints

bun only; token vars; fail-closed; no secrets; reduced-motion honored; sounds mutable.

## Success

Animated + sounding game, matrix green, status green, Sentry event seen, load p95 met, checklist written.
