import { describe, it, expect } from "vitest";
import type { Board, Color, GameState } from "./types";
import { applyMove } from "./international";

function emptyBoard(): Board {
  return Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => null),
  );
}

function state(board: Board, turn: Color = "white"): GameState {
  return { board, turn, winner: null };
}

function put(
  board: Board,
  r: number,
  c: number,
  color: Color,
  kind: "man" | "king" = "man",
): void {
  board[r][c] = { color, kind };
}

function deepFreeze(o: unknown): void {
  if (o && typeof o === "object") {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
}

describe("applyMove immutability", () => {
  it("does not mutate input board", () => {
    const b = emptyBoard();
    put(b, 5, 4, "white");
    put(b, 4, 3, "black");
    put(b, 0, 9, "black");
    const s = state(b);
    const before = JSON.stringify(s);
    applyMove(s, {
      from: [5, 4],
      to: [3, 2],
      captures: [[4, 3]],
      promotes: false,
    });
    expect(JSON.stringify(s)).toBe(before);
  });

  it("clones board: mutating result leaves input untouched", () => {
    const b = emptyBoard();
    put(b, 5, 4, "white");
    put(b, 2, 3, "black");
    const s = state(b);
    const next = applyMove(s, {
      from: [5, 4],
      to: [4, 3],
      captures: [],
      promotes: false,
    });
    expect(next.board).not.toBe(s.board);
    next.board[4][3] = null;
    expect(s.board[5][4]).toMatchObject({ color: "white" });
  });

  it("works on deep-frozen input", () => {
    const b = emptyBoard();
    put(b, 5, 4, "white");
    put(b, 4, 3, "black");
    put(b, 0, 9, "black");
    const s = state(b);
    deepFreeze(s);
    const next = applyMove(s, {
      from: [5, 4],
      to: [3, 2],
      captures: [[4, 3]],
      promotes: false,
    });
    expect(next.board[3][2]).toMatchObject({ color: "white" });
    expect(next.board[4][3]).toBeNull();
  });
});
