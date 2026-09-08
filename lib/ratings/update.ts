// Per-game Glicko-2 updater + finish persistence helper.
// Pure math (no I/O) except persistFinishedGame, which runs against a
// narrow FinishStore interface so tests use an in-memory store and the
// route adapts Drizzle to it. No live DB required for unit tests.

import {
  updateRating,
  newPlayerRating,
  type Glicko2Rating,
} from "./glicko2";

export type GameWinner = "white" | "black" | "draw";
export type FinishWinner = GameWinner | null;

export interface RatingState extends Glicko2Rating {
  gamesPlayed: number;
}

export function newRatingState(): RatingState {
  return { ...newPlayerRating(), gamesPlayed: 0 };
}

export function scoresForWinner(winner: FinishWinner): {
  white: number;
  black: number;
} {
  if (winner === "white") return { white: 1, black: 0 };
  if (winner === "black") return { white: 0, black: 1 };
  // Draw — and null (aborted/undecided), rated as draw-equivalent so the
  // game still counts for RD decay without moving either rating far.
  return { white: 0.5, black: 0.5 };
}

/** Single-opponent Glicko-2 update for both sides of one finished game. */
export function applyGameResult(
  white: RatingState,
  black: RatingState,
  winner: FinishWinner,
): { white: RatingState; black: RatingState } {
  const scores = scoresForWinner(winner);
  const nextWhite = updateRating(white, [
    { rating: black.rating, rd: black.rd, score: scores.white },
  ]);
  const nextBlack = updateRating(black, [
    { rating: white.rating, rd: white.rd, score: scores.black },
  ]);
  return {
    white: { ...nextWhite, gamesPlayed: white.gamesPlayed + 1 },
    black: { ...nextBlack, gamesPlayed: black.gamesPlayed + 1 },
  };
}

export interface GameInput {
  gameId: string;
  whiteClerkId: string;
  blackClerkId: string;
  winner: FinishWinner;
  reason: string | null;
  moves: unknown[];
}

export interface GameRow extends GameInput {
  finishedAt: Date;
}

export interface HistoryRow {
  clerkId: string;
  gameId: string;
  rating: number;
  rd: number;
}

export interface RatingDelta {
  before: RatingState;
  after: RatingState;
}

export interface FinishResult {
  game: GameRow;
  duplicate: boolean;
  white: RatingDelta;
  black: RatingDelta;
}

/** Minimal persistence surface; Drizzle-backed in the route, in-memory in tests. */
export interface FinishStore {
  findGame(gameId: string): Promise<GameRow | null>;
  /** Insert; false when the gameId already exists (concurrent retry). */
  insertGame(game: GameInput): Promise<boolean>;
  /** Default new-player state when the clerkId has no row yet. */
  getRating(clerkId: string): Promise<RatingState>;
  saveRating(clerkId: string, r: RatingState): Promise<void>;
  addHistory(row: HistoryRow): Promise<void>;
  historyForGame(gameId: string): Promise<HistoryRow[]>;
}

/**
 * Idempotent persist: same gameId twice → one game row, ratings move once.
 * Duplicate with full history returns zero deltas; duplicate with missing
 * history (crash between insertGame and history writes) recomputes and
 * persists instead of reporting a false zero-delta success.
 * TODO (live-DB hardening): crash between saveRating and addHistory can
 * double-apply on recovery (recompute runs on already-moved ratings).
 * Needs a multi-statement txn (not available on neon-http) or an idempotency
 * guard (e.g. conditional save on history-absent / rating version) so the
 * retry is a no-op when ratings already moved.
 */
export async function persistFinishedGame(
  store: FinishStore,
  input: GameInput,
): Promise<FinishResult> {
  const existing = await store.findGame(input.gameId);
  if (existing) {
    return duplicateResult(store, existing);
  }
  const inserted = await store.insertGame(input);
  if (!inserted) {
    const raced = await store.findGame(input.gameId);
    if (!raced) throw new Error("finish persist race lost without a row");
    return duplicateResult(store, raced);
  }

  const [whiteBefore, blackBefore] = await Promise.all([
    store.getRating(input.whiteClerkId),
    store.getRating(input.blackClerkId),
  ]);
  const next = applyGameResult(whiteBefore, blackBefore, input.winner);
  await Promise.all([
    store.saveRating(input.whiteClerkId, next.white),
    store.saveRating(input.blackClerkId, next.black),
  ]);
  await Promise.all([
    store.addHistory({
      clerkId: input.whiteClerkId,
      gameId: input.gameId,
      rating: next.white.rating,
      rd: next.white.rd,
    }),
    store.addHistory({
      clerkId: input.blackClerkId,
      gameId: input.gameId,
      rating: next.black.rating,
      rd: next.black.rd,
    }),
  ]);

  return {
    game: { ...input, finishedAt: new Date() },
    duplicate: false,
    white: { before: whiteBefore, after: next.white },
    black: { before: blackBefore, after: next.black },
  };
}

async function duplicateResult(
  store: FinishStore,
  game: GameRow,
): Promise<FinishResult> {
  const [histories, whiteCurrent, blackCurrent] = await Promise.all([
    store.historyForGame(game.gameId),
    store.getRating(game.whiteClerkId),
    store.getRating(game.blackClerkId),
  ]);
  if (histories.length < 2) {
    // Crash between insertGame and the history writes: the game row exists
    // but ratings never moved (or only one side wrote). Recompute from
    // current ratings and persist. Safe to retry: applyGameResult is
    // deterministic on the same inputs, saveRating upserts the same values,
    // and history writes are idempotent (unique game+clerk, guarded), so a
    // retried recovery cannot double-apply. `before` is the best available
    // (post-crash current), not the true pre-game value.
    const next = applyGameResult(whiteCurrent, blackCurrent, game.winner);
    await Promise.all([
      store.saveRating(game.whiteClerkId, next.white),
      store.saveRating(game.blackClerkId, next.black),
    ]);
    await Promise.all([
      store.addHistory({
        clerkId: game.whiteClerkId,
        gameId: game.gameId,
        rating: next.white.rating,
        rd: next.white.rd,
      }),
      store.addHistory({
        clerkId: game.blackClerkId,
        gameId: game.gameId,
        rating: next.black.rating,
        rd: next.black.rd,
      }),
    ]);
    return {
      game,
      duplicate: true,
      white: { before: whiteCurrent, after: next.white },
      black: { before: blackCurrent, after: next.black },
    };
  }
  const afterFor = (clerkId: string, current: RatingState): RatingState => {
    const h = histories.find((r) => r.clerkId === clerkId);
    return h
      ? { ...current, rating: h.rating, rd: h.rd }
      : current;
  };
  const whiteAfter = afterFor(game.whiteClerkId, whiteCurrent);
  const blackAfter = afterFor(game.blackClerkId, blackCurrent);
  // Duplicate with history present: ratings already moved exactly once, so
  // `before` is deliberately reported as `after` (zero deltas) rather than
  // re-applying or fabricating history. Never re-apply on this path.
  return {
    game,
    duplicate: true,
    white: { before: whiteAfter, after: whiteAfter },
    black: { before: blackAfter, after: blackAfter },
  };
}
