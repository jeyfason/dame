import { readFileSync, existsSync } from "fs";
import { describe, it, expect } from "vitest";

describe("dame tokens", () => {
  it("defines required CSS vars", () => {
    const p = "app/dame-tokens.css";
    expect(existsSync(p)).toBe(true);
    const css = readFileSync(p, "utf8");
    for (const v of ["--dame-felt", "--dame-ivory", "--dame-ebony", "--dame-gold", "--dame-teal"]) {
      expect(css).toContain(v);
    }
  });
});
