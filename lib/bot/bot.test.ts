import { describe, it, expect } from "vitest";
import type { Board, Color, GameState } from "@/lib/rules/types";
import { initialBoard, legalMoves, applyMove } from "@/lib/rules/international";
import { chooseBotMove, evaluate } from "./bot";

function emptyBoard(): Board {
  return Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => null));
}

function state(board: Board, turn: Color = "white", winner: Color | null = null): GameState {
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

describe("bot basics", () => {
  it("returns a legal move from the initial position at every level", () => {
    for (const level of ["easy", "medium", "hard"] as const) {
      const move = chooseBotMove(initialBoard(), level);
      expect(move).not.toBeNull();
      const legal = legalMoves(initialBoard());
      expect(
        legal.some(
          (m) =>
            m.from[0] === move!.from[0] &&
            m.from[1] === move!.from[1] &&
            m.to[0] === move!.to[0] &&
            m.to[1] === move!.to[1],
        ),
      ).toBe(true);
    }
  });

  it("returns null when the game is over", () => {
    const b = emptyBoard();
    put(b, 5, 4, "white");
    const s = state(b, "white", "white");
    expect(chooseBotMove(s, "hard")).toBeNull();
  });

  it("evaluates material symmetrically by color", () => {
    const b = emptyBoard();
    put(b, 5, 4, "white");
    const whiteView = evaluate(state(b, "white"));
    const blackView = evaluate(state(b, "black"));
    expect(whiteView).toBeGreaterThan(0);
    expect(blackView).toBeLessThan(0);
  });

  it("values kings above men", () => {
    const withMan = emptyBoard();
    put(withMan, 5, 4, "white");
    const withKing = emptyBoard();
    put(withKing, 5, 4, "white", "king");
    expect(
      evaluate(state(withKing, "white")) - evaluate(state(withMan, "white")),
    ).toBeGreaterThan(100);
  });
});

describe("bot tactics", () => {
  it("hard bot steps out of a flying-king capture line", () => {
    // White man on (4,4) sits on the black king's diagonal; stepping to
    // (3,3) stays capturable, stepping to (3,5) is safe.
    const b = emptyBoard();
    put(b, 4, 4, "white");
    put(b, 0, 0, "black", "king");
    const move = chooseBotMove(state(b, "white"), "hard");
    expect(move).not.toBeNull();
    expect(move!.to).toEqual([3, 5]);
  });

  it("takes a winning capture immediately (last enemy piece)", () => {
    const b = emptyBoard();
    put(b, 4, 3, "white");
    put(b, 3, 4, "black");
    const move = chooseBotMove(state(b, "white"), "easy");
    expect(move).not.toBeNull();
    const next = applyMove(state(b, "white"), move!);
    expect(next.winner).toBe("white");
  });

  it("medium bot avoids losing a man to a simple exchange", () => {
    // White man at (5,4): (4,5) walks into black's king line and is lost;
    // (4,3) is safe. Black king at (0,6) covers the (1,5),(2,4),(3,3)? no —
    // covers (1,5),(2,4),(3,3),(4,2) diagonal and (1,7),(2,8),(3,9).
    // White man moving (4,5) is NOT on that line — instead use a black man
    // poised to capture: black man at (3,6) captures (4,5) landing (5,4),
    // which is vacated. So (4,5) loses the man, (4,3) is safe.
    const b = emptyBoard();
    put(b, 5, 4, "white");
    put(b, 3, 6, "black");
    const move = chooseBotMove(state(b, "white"), "medium");
    expect(move).not.toBeNull();
    expect(move!.to).toEqual([4, 3]);
  });

  it("never returns an illegal move when captures are mandatory", () => {
    const b = emptyBoard();
    put(b, 5, 4, "white", "king");
    put(b, 3, 2, "black");
    put(b, 3, 6, "black");
    for (const level of ["easy", "medium", "hard"] as const) {
      const move = chooseBotMove(state(b, "white"), level);
      expect(move).not.toBeNull();
      const legal = legalMoves(state(b, "white"));
      expect(move!.captures.length).toBeGreaterThan(0);
      expect(legal.some((m) => m.to[0] === move!.to[0] && m.to[1] === move!.to[1])).toBe(true);
    }
  });
});
