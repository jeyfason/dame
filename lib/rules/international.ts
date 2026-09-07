import type { Board, GameState } from "./types";

export function initialBoard(): GameState {
  const board: Board = Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => null),
  );
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      if ((r + c) % 2 !== 1) continue;
      if (r <= 3) board[r][c] = { color: "black", kind: "man" };
      else if (r >= 6) board[r][c] = { color: "white", kind: "man" };
    }
  }
  return { board, turn: "white", winner: null };
}
