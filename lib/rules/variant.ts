import type { GameState, Move } from "./types";
export interface RulesModule {
  initialBoard(): GameState;
  legalMoves(state: GameState): Move[];
  applyMove(state: GameState, move: Move): GameState;
}
