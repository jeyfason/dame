import { describe, it, expect } from "vitest";
import {
  updateRating,
  newPlayerRating,
  DEFAULT_RATING,
  DEFAULT_RD,
  DEFAULT_VOL,
} from "./glicko2";

describe("glicko2", () => {
  it("matches Glickman published example within 0.1", () => {
    // Glickman glicko2.pdf: "winning the first game and losing the next
    // two" -> scores 1, 0, 0; expects 1464.06 / 151.52 / 0.05999.
    const result = updateRating(
      { rating: 1500, rd: 200, vol: 0.06 },
      [
        { rating: 1400, rd: 30, score: 1 },
        { rating: 1550, rd: 100, score: 0 },
        { rating: 1700, rd: 300, score: 0 },
      ],
    );
    expect(Math.abs(result.rating - 1464.06)).toBeLessThan(0.1);
    expect(Math.abs(result.rd - 151.52)).toBeLessThan(0.1);
    expect(Math.abs(result.vol - 0.05999)).toBeLessThan(0.001);
  });

  it("provides new-player defaults (1500/350/0.06)", () => {
    expect(DEFAULT_RATING).toBe(1500);
    expect(DEFAULT_RD).toBe(350);
    expect(DEFAULT_VOL).toBe(0.06);
    expect(newPlayerRating()).toEqual({ rating: 1500, rd: 350, vol: 0.06 });
  });
});
