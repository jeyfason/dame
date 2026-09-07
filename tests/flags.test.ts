import { describe, it, expect } from "vitest";
import { getFlag } from "../lib/flags/getFlag";

describe("getFlag fail-closed", () => {
  it("returns false for unknown key when DB unavailable", async () => {
    await expect(getFlag("__missing_flag__")).resolves.toBe(false);
  });
});
