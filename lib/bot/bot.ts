import type { Color, GameState, Move } from "@/lib/rules/types";
import { applyMove, legalMoves } from "@/lib/rules/international";

export type BotLevel = "easy" | "medium" | "hard";

interface LevelConfig {
  depth: number;
  budgetMs: number;
  /** Centipawn band around the best score where easy bots pick randomly. */
  noiseCp: number;
}

const LEVELS: Record<BotLevel, LevelConfig> = {
  easy: { depth: 2, budgetMs: 200, noiseCp: 90 },
  medium: { depth: 5, budgetMs: 550, noiseCp: 6 },
  hard: { depth: 8, budgetMs: 950, noiseCp: 0 },
};

const MAN_CP = 100;
const KING_CP = 265;
const WIN_CP = 100_000;

/** Static evaluation from the perspective of `state.turn`. Deterministic. */
export function evaluate(state: GameState): number {
  let score = 0; // positive = good for white
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      const sq = state.board[r][c];
      if (!sq) continue;
      // Center columns are worth a little more (draughts play hugs the middle).
      const center = 3 - Math.abs(c - 4.5);
      if (sq.kind === "king") {
        score += (sq.color === "white" ? 1 : -1) * (KING_CP + Math.round(center));
        continue;
      }
      // Men gain value as they advance toward promotion.
      const advance = sq.color === "white" ? 9 - r : r;
      const backRankGuard = (sq.color === "white" ? r === 9 : r === 0) ? 6 : 0;
      score +=
        (sq.color === "white" ? 1 : -1) *
        (MAN_CP + advance * 3 + backRankGuard + Math.round(center * 0.5));
    }
  }
  return state.turn === "white" ? score : -score;
}

function orderMoves(moves: Move[]): Move[] {
  return [...moves].sort((a, b) => b.captures.length - a.captures.length);
}

/** Negamax with alpha-beta. Returns score from the perspective of state.turn. */
function negamax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  deadline: number,
): number {
  if (state.winner) {
    // The winner is the previous mover, so the side to move here has lost.
    return -WIN_CP - depth;
  }
  if (depth === 0) return evaluate(state);
  if (Date.now() > deadline) return evaluate(state);

  const moves = legalMoves(state);
  if (moves.length === 0) return -WIN_CP - depth;

  let best = -Infinity;
  for (const move of orderMoves(moves)) {
    const score = -negamax(applyMove(state, move), depth - 1, -beta, -alpha, deadline);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function searchRoot(
  state: GameState,
  moves: Move[],
  depth: number,
  deadline: number,
): { scores: number[]; timedOut: boolean } {
  const scores = new Array<number>(moves.length).fill(-Infinity);
  let alpha = -Infinity;
  let timedOut = true;
  for (let i = 0; i < moves.length; i++) {
    scores[i] = -negamax(applyMove(state, moves[i]), depth - 1, -Infinity, -alpha, deadline);
    if (scores[i] > alpha) alpha = scores[i];
    if (Date.now() > deadline) return { scores, timedOut };
  }
  timedOut = false;
  return { scores, timedOut };
}

function pickWeighted(moves: Move[], scores: number[], noiseCp: number): Move {
  let best = -Infinity;
  for (const s of scores) if (s > best) best = s;
  const candidates: number[] = [];
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] >= best - noiseCp) candidates.push(i);
  }
  const pick = candidates[Math.floor(Math.random() * candidates.length)] ?? 0;
  return moves[pick];
}

/**
 * Pick a move for the side to move. Iterative deepening under a time
 * budget; levels trade depth for noise. Returns null only when the game
 * is already over (no legal moves).
 */
export function chooseBotMove(state: GameState, level: BotLevel = "medium"): Move | null {
  if (state.winner) return null;
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];

  const conf = LEVELS[level];
  const start = Date.now();
  const deadline = start + conf.budgetMs;

  // Depth-1 ordering pass gives alpha-beta a decent first line.
  const ordered = orderMoves(moves);
  let best = ordered[0];
  for (let depth = 2; depth <= conf.depth; depth++) {
    const { scores, timedOut } = searchRoot(state, ordered, depth, deadline);
    if (!timedOut || depth === 2) {
      const completed = scores.some((s) => s > -Infinity);
      if (completed) best = pickWeighted(ordered, scores, conf.noiseCp);
    }
    if (timedOut || Date.now() > deadline) break;
  }
  return best;
}

export function botColorLabel(color: Color): string {
  return color === "white" ? "White" : "Black";
}
