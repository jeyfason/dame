import { describe, it, expect } from "vitest";
import {
  applyGameResult,
  scoresForWinner,
  newRatingState,
} from "./update";
import { DEFAULT_RATING, DEFAULT_RD } from "./glicko2";

describe("ratings/update", () => {
  it("maps winner to scores (white=1/0, black=0/1, draw|null=0.5/0.5)", () => {
    expect(scoresForWinner("white")).toEqual({ white: 1, black: 0 });
    expect(scoresForWinner("black")).toEqual({ white: 0, black: 1 });
    expect(scoresForWinner("draw")).toEqual({ white: 0.5, black: 0.5 });
    expect(scoresForWinner(null)).toEqual({ white: 0.5, black: 0.5 });
  });

  it("winner rating up, loser down", () => {
    const white = newRatingState();
    const black = newRatingState();
    const after = applyGameResult(white, black, "white");
    expect(after.white.rating).toBeGreaterThan(DEFAULT_RATING);
    expect(after.black.rating).toBeLessThan(DEFAULT_RATING);
  });

  it("new-player RD shrinks after a rated game", () => {
    const after = applyGameResult(newRatingState(), newRatingState(), "black");
    expect(after.white.rd).toBeLessThan(DEFAULT_RD);
    expect(after.black.rd).toBeLessThan(DEFAULT_RD);
  });

  it("draw between new players stays near 1500 with smaller RD", () => {
    const after = applyGameResult(newRatingState(), newRatingState(), "draw");
    expect(Math.abs(after.white.rating - DEFAULT_RATING)).toBeLessThan(1);
    expect(Math.abs(after.black.rating - DEFAULT_RATING)).toBeLessThan(1);
    expect(after.white.rd).toBeLessThan(DEFAULT_RD);
  });
});
