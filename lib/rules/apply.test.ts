import { describe, it, expect } from "vitest";
import type { Board, Color, GameState, Move } from "./types";
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

describe("applyMove quiet", () => {
  it("moves piece and flips turn", () => {
    const b = emptyBoard();
    put(b, 5, 4, "white");
    put(b, 2, 3, "black");
    const next = applyMove(state(b), {
      from: [5, 4],
      to: [4, 3],
      captures: [],
      promotes: false,
    });
    expect(next.board[5][4]).toBeNull();
    expect(next.board[4][3]).toMatchObject({ color: "white", kind: "man" });
    expect(next.turn).toBe("black");
    expect(next.winner).toBeNull();
  });
});

describe("applyMove captures", () => {
  it("removes taken piece", () => {
    const b = emptyBoard();
    put(b, 5, 4, "white");
    put(b, 4, 3, "black");
    put(b, 2, 5, "black");
    const next = applyMove(state(b), {
      from: [5, 4],
      to: [3, 2],
      captures: [[4, 3]],
      promotes: false,
    });
    expect(next.board[4][3]).toBeNull();
    expect(next.board[3][2]).toMatchObject({ color: "white" });
    expect(next.board[2][5]).toMatchObject({ color: "black" });
    expect(next.turn).toBe("black");
  });

  it("removes all taken on multi-jump", () => {
    const b = emptyBoard();
    put(b, 7, 0, "white");
    put(b, 6, 1, "black");
    put(b, 4, 3, "black");
    put(b, 0, 9, "black");
    const next = applyMove(state(b), {
      from: [7, 0],
      to: [3, 4],
      captures: [
        [6, 1],
        [4, 3],
      ],
      promotes: false,
    });
    expect(next.board[6][1]).toBeNull();
    expect(next.board[4][3]).toBeNull();
    expect(next.board[3][4]).toMatchObject({ color: "white" });
  });
});

describe("applyMove promotion", () => {
  it("promotes white man reaching row 0 and ends move", () => {
    const b = emptyBoard();
    put(b, 1, 2, "white");
    put(b, 5, 4, "black");
    const next = applyMove(state(b), {
      from: [1, 2],
      to: [0, 1],
      captures: [],
      promotes: true,
    });
    expect(next.board[0][1]).toMatchObject({ color: "white", kind: "king" });
    expect(next.turn).toBe("black");
  });

  it("promotes capture ending on back rank", () => {
    const b = emptyBoard();
    put(b, 2, 5, "white");
    put(b, 1, 4, "black");
    put(b, 5, 0, "black");
    const next = applyMove(state(b), {
      from: [2, 5],
      to: [0, 3],
      captures: [[1, 4]],
      promotes: true,
    });
    expect(next.board[0][3]).toMatchObject({ color: "white", kind: "king" });
    expect(next.board[1][4]).toBeNull();
    expect(next.turn).toBe("black");
  });

  it("promotes black man reaching row 9", () => {
    const b = emptyBoard();
    put(b, 8, 1, "black");
    put(b, 5, 4, "white");
    const next = applyMove(
      state(b, "black"),
      {
        from: [8, 1],
        to: [9, 0],
        captures: [],
        promotes: true,
      } satisfies Move,
    );
    expect(next.board[9][0]).toMatchObject({ color: "black", kind: "king" });
    expect(next.turn).toBe("white");
  });
});

describe("applyMove winner", () => {
  it("sets winner when opponent has no pieces", () => {
    const b = emptyBoard();
    put(b, 5, 4, "white");
    put(b, 4, 3, "black");
    const next = applyMove(state(b), {
      from: [5, 4],
      to: [3, 2],
      captures: [[4, 3]],
      promotes: false,
    });
    expect(next.winner).toBe("white");
  });

  it("sets winner when opponent has no moves", () => {
    const b = emptyBoard();
    // Black victim fully surrounded: quiet squares occupied, landings blocked.
    put(b, 5, 4, "black");
    put(b, 4, 3, "white");
    put(b, 4, 5, "white");
    put(b, 6, 3, "white");
    put(b, 6, 5, "white");
    put(b, 3, 2, "white");
    put(b, 3, 6, "white");
    put(b, 7, 2, "white");
    put(b, 7, 6, "white");
    // Distant white mover, far from the block.
    put(b, 9, 6, "white");
    const next = applyMove(state(b), {
      from: [9, 6],
      to: [8, 5],
      captures: [],
      promotes: false,
    });
    expect(next.winner).toBe("white");
  });
});

describe("applyMove illegal", () => {
  it('rejects illegal move with Error("illegal move")', () => {
    const b = emptyBoard();
    put(b, 5, 4, "white");
    put(b, 4, 3, "black");
    // Quiet step illegal while capture exists.
    expect(() =>
      applyMove(state(b), {
        from: [5, 4],
        to: [4, 5],
        captures: [],
        promotes: false,
      }),
    ).toThrow("illegal move");
  });

  it("rejects moving empty square", () => {
    const b = emptyBoard();
    put(b, 5, 4, "white");
    put(b, 2, 1, "black");
    expect(() =>
      applyMove(state(b), {
        from: [0, 1],
        to: [1, 0],
        captures: [],
        promotes: false,
      }),
    ).toThrow("illegal move");
  });
});
