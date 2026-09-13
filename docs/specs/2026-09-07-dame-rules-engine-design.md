# Dame Stage 2 — International Rules Engine Design Spec

**Date:** 2026-09-07
**Status:** Approved sections 1-4
**Source:** PRD §6.1 + Stage 1 foundations on main
**Approach:** A functional immutable engine

## Goal

Bulletproof international checkers engine + exhaustive tests + local pass-and-play board, variant-pluggable and bot-ready, no realtime yet.

## Non-goals

No Durable Objects, clocks, matchmaking, ratings, voice. Draw offers, AI opponent, other variants deferred.

## Architecture

- `lib/rules/types.ts`: Color, PieceKind, Piece, Square, Board, Move, GameState
- `lib/rules/international.ts`: `initialBoard()`, `legalMoves(state)`, `applyMove(state, move)` pure, new state out
- `lib/rules/variant.ts`: `RulesModule { initialBoard, legalMoves, applyMove }` interface
- `components/dame/LocalBoard.tsx`: click-select, highlight dests, apply, toast on illegal, promotion/win states
- `/play` wires LocalBoard for 2-player local

## Rules semantics

10x10 dark-squares, 20v20 start. Men step/capture forward and backward. Kings fly any diagonal distance, landing any empty beyond. Mandatory capture, quantity-majority (max captures). Multi-jump single Move, must complete. Promotion on back rank ends move. Win when side to move has no pieces or no legal moves.

[^fmjd-quiet]: Brief §6.1 deviation (intentional): men step quietly backward as well as forward. Strict FMJD quiet steps are forward-only; captures remain bidirectional in both. Locked by `men step backward quietly` test in `lib/rules/final-review.test.ts`.

## Testing + API

Vitest 60+ cases: layout, steps, king slides, captures, chains, majority enforcement, promotion stop, win by pieces, win by block, illegal rejections, immutability freeze. `legalMoves` shared by UI now, DO + bots later.

## Constraints

bun only, no hand package.json edits. No raw hex outside tokens. tsc+eslint+vitest+build green.

## Success

60+ engine tests green, local /play 2-player works mobile/desktop, immutable, variant interface documented.
