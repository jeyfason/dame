import { describe, it, expect } from "vitest";
import type { Board, Color, GameState } from "./types";
import { applyMove, legalMoves } from "./international";

function emptyBoard(): Board {
  return Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => null),
  );
}

function state(
  board: Board,
  turn: Color = "white",
  winner: Color | null = null,
): GameState {
  return { board, turn, winner };
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

describe("promotion mid-chain stop (man ends on back rank)", () => {
  it("white capture landing on row 0 stops: 1 capture, no extension", () => {
    const b = emptyBoard();
    put(b, 2, 1, "white");
    put(b, 1, 2, "black");
    put(b, 1, 4, "black");
    const moves = legalMoves(state(b));
    expect(moves).toHaveLength(1);
    expect(moves[0].to).toEqual([0, 3]);
    expect(moves[0].captures).toEqual([[1, 2]]);
    expect(moves[0].promotes).toBe(true);
  });

  it("black capture landing on row 9 stops: 1 capture, no extension", () => {
    const b = emptyBoard();
    put(b, 7, 8, "black");
    put(b, 8, 7, "white");
    put(b, 8, 5, "white");
    const moves = legalMoves(state(b, "black"));
    expect(moves).toHaveLength(1);
    expect(moves[0].to).toEqual([9, 6]);
    expect(moves[0].captures).toEqual([[8, 7]]);
    expect(moves[0].promotes).toBe(true);
  });
});

describe("winner lock", () => {
  it("legalMoves returns [] when winner is set", () => {
    const b = emptyBoard();
    put(b, 5, 4, "white");
    put(b, 2, 3, "black");
    expect(legalMoves(state(b, "white", "white"))).toEqual([]);
  });

  it("applyMove rejects when winner is set", () => {
    const b = emptyBoard();
    put(b, 5, 4, "white");
    put(b, 2, 3, "black");
    expect(() =>
      applyMove(state(b, "white", "white"), {
        from: [5, 4],
        to: [4, 3],
        captures: [],
        promotes: false,
      }),
    ).toThrow("illegal move");
  });
});

describe("promotes flag is derived", () => {
  it("quiet step onto back rank promotes even if input says false", () => {
    const b = emptyBoard();
    put(b, 1, 2, "white");
    put(b, 5, 4, "black");
    const next = applyMove(state(b), {
      from: [1, 2],
      to: [0, 1],
      captures: [],
      promotes: false,
    });
    expect(next.board[0][1]).toMatchObject({ color: "white", kind: "king" });
  });

  it("quiet step off back rank stays man even if input says true", () => {
    const b = emptyBoard();
    put(b, 5, 4, "white");
    put(b, 2, 3, "black");
    const next = applyMove(state(b), {
      from: [5, 4],
      to: [4, 3],
      captures: [],
      promotes: true,
    });
    expect(next.board[4][3]).toMatchObject({ color: "white", kind: "man" });
  });
});

describe("king multi-landing + forward-only quiet steps", () => {
  it("king capture exposes every empty beyond as a separate move", () => {
    const b = emptyBoard();
    put(b, 5, 2, "white", "king");
    put(b, 3, 4, "black");
    const moves = legalMoves(state(b));
    expect(moves).toHaveLength(3);
    expect(moves.every((m) => m.captures.length === 1)).toBe(true);
    expect(moves.map((m) => m.to)).toEqual(
      expect.arrayContaining([
        [2, 5],
        [1, 6],
        [0, 7],
      ]),
    );
  });

  it("men cannot step backward (strict FMJD forward-only quiet moves)", () => {
    // Strict FMJD: men's quiet steps are forward-diagonal only. Captures
    // stay bidirectional (locked by the backward-capture suites).
    const b = emptyBoard();
    put(b, 5, 4, "white");
    const moves = legalMoves(state(b));
    expect(moves).toHaveLength(2);
    expect(moves.map((m) => m.to)).toEqual(
      expect.arrayContaining([
        [4, 3],
        [4, 5],
      ]),
    );
    expect(moves.map((m) => m.to)).not.toContainEqual([6, 3]);
    expect(moves.map((m) => m.to)).not.toContainEqual([6, 5]);
  });

  it("man still captures backward (captures stay bidirectional)", () => {
    const b = emptyBoard();
    put(b, 5, 4, "white");
    put(b, 6, 3, "black");
    const moves = legalMoves(state(b));
    expect(moves).toHaveLength(1);
    expect(moves[0].to).toEqual([7, 2]);
    expect(moves[0].captures).toEqual([[6, 3]]);
  });
});
