import { readFileSync, existsSync } from "fs";
import { describe, it, expect } from "vitest";

describe("dame tokens", () => {
  it("defines the classic-premium CSS vars (spec 2026-09-09)", () => {
    const p = "app/dame-tokens.css";
    expect(existsSync(p)).toBe(true);
    const css = readFileSync(p, "utf8");
    for (const v of [
      "--dame-board-light",
      "--dame-board-dark",
      "--dame-board-frame",
      "--dame-piece-white",
      "--dame-piece-black",
      "--dame-accent",
      "--dame-felt",
      "--dame-felt-deep",
      "--dame-surface",
      "--dame-text",
      "--dame-muted",
      "--dame-danger",
      "--dame-t-slide",
    ]) {
      expect(css).toContain(v);
    }
  });
});
