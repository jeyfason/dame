import { describe, it, expect } from "vitest";
import { initialBoard } from "./international";

describe("initial", () => {
  it("places 20v20 on dark squares", () => {
    const s = initialBoard();
    const flat = s.board.flat();
    expect(flat.filter((p) => p?.color === "black").length).toBe(20);
    expect(flat.filter((p) => p?.color === "white").length).toBe(20);
    expect(s.turn).toBe("white");
  });
});
