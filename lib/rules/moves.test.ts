import { describe, it, expect } from "vitest";
import type { Board, Color, GameState, Move } from "./types";
import { initialBoard, legalMoves } from "./international";

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

function from(moves: Move[], r: number, c: number): Move[] {
  return moves.filter((m) => m.from[0] === r && m.from[1] === c);
}

function dests(moves: Move[]): [number, number][] {
  return moves.map((m) => m.to);
}

describe("quiet man steps", () => {
  it("white has 9 quiet moves from start, no captures", () => {
    const moves = legalMoves(initialBoard());
    expect(moves).toHaveLength(9);
    expect(moves.every((m) => m.captures.length === 0)).toBe(true);
    expect(moves.every((m) => m.from[0] === 6)).toBe(true);
  });

  it("black has 9 quiet moves from start", () => {
    const s = initialBoard();
    s.turn = "black";
    const moves = legalMoves(s);
    expect(moves).toHaveLength(9);
    expect(moves.every((m) => m.captures.length === 0)).toBe(true);
    expect(moves.every((m) => m.from[0] === 3)).toBe(true);
  });

  it("lone white man in center has 4 steps (forward+backward)", () => {
    const b = emptyBoard();
    put(b, 5, 4, "white");
    expect(dests(legalMoves(state(b)))).toEqual(
      expect.arrayContaining([
        [4, 3],
        [4, 5],
        [6, 3],
        [6, 5],
      ]),
    );
    expect(legalMoves(state(b))).toHaveLength(4);
  });

  it("lone black man in center has 4 steps", () => {
    const b = emptyBoard();
    put(b, 4, 5, "black");
    expect(legalMoves(state(b, "black"))).toHaveLength(4);
  });

  it("corner man (9,0) has exactly 1 step", () => {
    const b = emptyBoard();
    put(b, 9, 0, "white");
    const moves = legalMoves(state(b));
    expect(moves).toHaveLength(1);
    expect(moves[0].to).toEqual([8, 1]);
  });

  it("man surrounded by own pieces has no moves", () => {
    const b = emptyBoard();
    put(b, 5, 4, "white");
    put(b, 4, 3, "white");
    put(b, 4, 5, "white");
    put(b, 6, 3, "white");
    put(b, 6, 5, "white");
    expect(from(legalMoves(state(b)), 5, 4)).toHaveLength(0);
  });

  it("white man steps backward to a higher row", () => {
    const b = emptyBoard();
    put(b, 3, 4, "white");
    expect(dests(legalMoves(state(b)))).toContainEqual([4, 3]);
  });

  it("quiet step onto back rank sets promotes", () => {
    const b = emptyBoard();
    put(b, 1, 2, "white");
    const moves = legalMoves(state(b));
    expect(moves).toHaveLength(4);
    const promo = moves.filter((m) => m.promotes);
    expect(dests(promo)).toEqual(
      expect.arrayContaining([
        [0, 1],
        [0, 3],
      ]),
    );
    expect(promo).toHaveLength(2);
  });

  it("non-promoting quiet step has promotes=false", () => {
    const b = emptyBoard();
    put(b, 5, 4, "white");
    expect(legalMoves(state(b)).every((m) => m.promotes === false)).toBe(true);
  });

  it("black man stepping onto row 9 promotes", () => {
    const b = emptyBoard();
    put(b, 8, 1, "black");
    const moves = legalMoves(state(b, "black"));
    const promo = moves.filter((m) => m.promotes);
    expect(dests(promo)).toEqual(
      expect.arrayContaining([
        [9, 0],
        [9, 2],
      ]),
    );
  });
});

describe("quiet king slides", () => {
  it("lone king center (4,3) has 15 slide targets", () => {
    const b = emptyBoard();
    put(b, 4, 3, "white", "king");
    const moves = legalMoves(state(b));
    expect(moves).toHaveLength(15);
    expect(moves.every((m) => m.captures.length === 0)).toBe(true);
  });

  it("king corner (9,8) has 9 slide targets", () => {
    const b = emptyBoard();
    put(b, 9, 8, "white", "king");
    expect(legalMoves(state(b))).toHaveLength(9);
  });

  it("king ray stops before own piece", () => {
    const b = emptyBoard();
    put(b, 4, 3, "white", "king");
    put(b, 2, 5, "white");
    const moves = from(legalMoves(state(b)), 4, 3);
    // NE ray loses (2,5),(1,6),(0,7) but keeps (3,4)
    expect(dests(moves)).toContainEqual([3, 4]);
    expect(dests(moves)).not.toContainEqual([2, 5]);
    expect(moves).toHaveLength(15 - 3);
  });

  it("king ray stops before enemy with no landing beyond (quiet only)", () => {
    const b = emptyBoard();
    put(b, 4, 3, "white", "king");
    put(b, 6, 5, "black");
    put(b, 7, 6, "black");
    const moves = legalMoves(state(b));
    // SE ray keeps (5,4) only; (6,5) occupied, (7,6) blocks the landing
    expect(moves).toHaveLength(11);
    expect(moves.every((m) => m.captures.length === 0)).toBe(true);
    expect(dests(moves)).toContainEqual([5, 4]);
    expect(dests(moves)).not.toContainEqual([6, 5]);
  });

  it("king quiet moves never promote", () => {
    const b = emptyBoard();
    put(b, 4, 3, "white", "king");
    expect(legalMoves(state(b)).every((m) => m.promotes === false)).toBe(true);
  });

  it("king fully boxed in has no quiet moves", () => {
    const b = emptyBoard();
    put(b, 1, 2, "white", "king");
    put(b, 0, 1, "white");
    put(b, 0, 3, "white");
    put(b, 2, 1, "white");
    put(b, 2, 3, "white");
    expect(from(legalMoves(state(b)), 1, 2)).toHaveLength(0);
  });
});

describe("man captures", () => {
  it("single forward capture is present with taken square", () => {
    const b = emptyBoard();
    put(b, 5, 4, "white");
    put(b, 4, 3, "black");
    const moves = legalMoves(state(b));
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({
      from: [5, 4],
      to: [3, 2],
      captures: [[4, 3]],
    });
  });

  it("man captures backward", () => {
    const b = emptyBoard();
    put(b, 4, 3, "white");
    put(b, 5, 4, "black");
    const moves = legalMoves(state(b));
    expect(moves).toHaveLength(1);
    expect(moves[0].to).toEqual([6, 5]);
    expect(moves[0].captures).toEqual([[5, 4]]);
  });

  it("black man captures backward (toward row 0)", () => {
    const b = emptyBoard();
    put(b, 5, 4, "black");
    put(b, 4, 3, "white");
    const moves = legalMoves(state(b, "black"));
    expect(moves).toHaveLength(1);
    expect(moves[0].to).toEqual([3, 2]);
  });

  it("capture blocked by occupied landing falls back to quiet moves", () => {
    const b = emptyBoard();
    put(b, 5, 4, "white");
    put(b, 4, 3, "black");
    put(b, 3, 2, "white");
    const moves = legalMoves(state(b));
    expect(moves.every((m) => m.captures.length === 0)).toBe(true);
    expect(moves.length).toBeGreaterThan(0);
  });

  it("capture with off-board landing is illegal", () => {
    const b = emptyBoard();
    put(b, 1, 0, "white");
    put(b, 0, 1, "black");
    const moves = legalMoves(state(b));
    expect(moves.every((m) => m.captures.length === 0)).toBe(true);
  });

  it("cannot capture own piece", () => {
    const b = emptyBoard();
    put(b, 5, 4, "white");
    put(b, 4, 3, "white");
    const moves = legalMoves(state(b));
    expect(moves.every((m) => m.captures.length === 0)).toBe(true);
  });

  it("capture landing on back rank promotes", () => {
    const b = emptyBoard();
    put(b, 2, 5, "white");
    put(b, 1, 4, "black");
    const moves = legalMoves(state(b));
    expect(moves).toHaveLength(1);
    expect(moves[0].to).toEqual([0, 3]);
    expect(moves[0].promotes).toBe(true);
  });
});

describe("flying king captures", () => {
  it("king takes distant enemy with all landings beyond", () => {
    const b = emptyBoard();
    put(b, 7, 2, "white", "king");
    put(b, 4, 5, "black");
    const moves = legalMoves(state(b));
    expect(moves).toHaveLength(4);
    expect(moves.every((m) => m.captures.length === 1)).toBe(true);
    expect(dests(moves)).toEqual(
      expect.arrayContaining([
        [3, 6],
        [2, 7],
        [1, 8],
        [0, 9],
      ]),
    );
  });

  it("king cannot jump own piece", () => {
    const b = emptyBoard();
    put(b, 7, 2, "white", "king");
    put(b, 5, 4, "white");
    const moves = legalMoves(state(b));
    expect(moves.every((m) => m.captures.length === 0)).toBe(true);
  });

  it("king capture needs an empty square beyond", () => {
    const b = emptyBoard();
    put(b, 7, 2, "white", "king");
    put(b, 1, 8, "black");
    put(b, 0, 9, "black");
    const moves = legalMoves(state(b));
    expect(moves).toHaveLength(11);
    expect(moves.every((m) => m.captures.length === 0)).toBe(true);
  });

  it("king captures over a gap (enemy 3 away)", () => {
    const b = emptyBoard();
    put(b, 8, 1, "white", "king");
    put(b, 5, 4, "black");
    const moves = legalMoves(state(b));
    expect(moves).toHaveLength(5);
    expect(moves.every((m) => m.captures.length === 1)).toBe(true);
    expect(moves[0].captures).toEqual([[5, 4]]);
  });
});

describe("multi-jump", () => {
  it("man double capture chain", () => {
    const b = emptyBoard();
    put(b, 7, 0, "white");
    put(b, 6, 1, "black");
    put(b, 4, 3, "black");
    const moves = legalMoves(state(b));
    expect(moves).toHaveLength(1);
    expect(moves[0].to).toEqual([3, 4]);
    expect(moves[0].captures).toEqual([
      [6, 1],
      [4, 3],
    ]);
  });

  it("man triple capture chain", () => {
    const b = emptyBoard();
    put(b, 8, 1, "white");
    put(b, 7, 2, "black");
    put(b, 5, 4, "black");
    put(b, 3, 6, "black");
    const moves = legalMoves(state(b));
    expect(moves).toHaveLength(1);
    expect(moves[0].to).toEqual([2, 7]);
    expect(moves[0].captures).toEqual([
      [7, 2],
      [5, 4],
      [3, 6],
    ]);
  });

  it("king double capture chain takes both enemies", () => {
    const b = emptyBoard();
    put(b, 9, 0, "white", "king");
    put(b, 7, 2, "black");
    put(b, 4, 5, "black");
    const moves = legalMoves(state(b));
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.captures.length === 2)).toBe(true);
    for (const m of moves) {
      expect(m.captures).toEqual(
        expect.arrayContaining([
          [7, 2],
          [4, 5],
        ]),
      );
      const flat = m.captures.map(([r, c]) => `${r},${c}`);
      expect(new Set(flat).size).toBe(flat.length);
    }
  });

  it("man never re-captures the same piece", () => {
    const b = emptyBoard();
    put(b, 6, 3, "white");
    put(b, 5, 2, "black");
    put(b, 5, 4, "black");
    const moves = legalMoves(state(b));
    expect(moves).toHaveLength(2);
    for (const m of moves) {
      const flat = m.captures.map(([r, c]) => `${r},${c}`);
      expect(new Set(flat).size).toBe(flat.length);
    }
  });
});

describe("majority and mandatory captures", () => {
  it("majority filters minority: 2-capture beats 1-capture", () => {
    const b = emptyBoard();
    put(b, 8, 7, "white");
    put(b, 7, 8, "black");
    put(b, 7, 6, "white");
    put(b, 6, 5, "black");
    put(b, 4, 3, "black");
    const moves = legalMoves(state(b));
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.captures.length === 2)).toBe(true);
    expect(from(moves, 8, 7)).toHaveLength(0);
  });

  it("same piece keeps only the longest direction", () => {
    const b = emptyBoard();
    put(b, 5, 4, "white");
    put(b, 4, 3, "black");
    put(b, 2, 1, "black");
    put(b, 6, 5, "black");
    const moves = legalMoves(state(b));
    expect(moves).toHaveLength(1);
    expect(moves[0].captures).toEqual([
      [4, 3],
      [2, 1],
    ]);
  });

  it("captures are mandatory: no quiet moves when capture exists", () => {
    const b = emptyBoard();
    put(b, 5, 4, "white");
    put(b, 4, 3, "black");
    put(b, 7, 6, "white");
    const moves = legalMoves(state(b));
    expect(moves.every((m) => m.captures.length > 0)).toBe(true);
    expect(from(moves, 7, 6)).toHaveLength(0);
  });

  it("equal-max captures are all kept", () => {
    const b = emptyBoard();
    put(b, 5, 0, "white");
    put(b, 4, 1, "black");
    put(b, 5, 6, "white");
    put(b, 4, 7, "black");
    const moves = legalMoves(state(b));
    expect(moves).toHaveLength(2);
    expect(moves.every((m) => m.captures.length === 1)).toBe(true);
  });
});

describe("no moves and immutability", () => {
  it("side with no pieces has zero moves", () => {
    const b = emptyBoard();
    put(b, 5, 4, "black");
    expect(legalMoves(state(b, "white"))).toHaveLength(0);
  });

  it("start position has no captures for either side", () => {
    const w = initialBoard();
    expect(legalMoves(w).some((m) => m.captures.length > 0)).toBe(false);
    const bl: GameState = { ...w, turn: "black" };
    expect(legalMoves(bl).some((m) => m.captures.length > 0)).toBe(false);
  });

  it("does not mutate the input board", () => {
    const s = initialBoard();
    const before = JSON.stringify(s.board);
    legalMoves(s);
    expect(JSON.stringify(s.board)).toBe(before);
  });

  it("works on a deep-frozen capture position", () => {
    const b = emptyBoard();
    put(b, 5, 4, "white");
    put(b, 4, 3, "black");
    const frozen = state(b);
    const deepFreeze = (o: unknown): void => {
      if (o && typeof o === "object") {
        for (const v of Object.values(o)) deepFreeze(v);
        Object.freeze(o);
      }
    };
    deepFreeze(frozen);
    const moves = legalMoves(frozen);
    expect(moves).toHaveLength(1);
    expect(moves[0].captures).toEqual([[4, 3]]);
  });
});
