import { describe, it, expect } from "vitest";
import * as schema from "../lib/db/schema";

describe("schema v1", () => {
  it("exports users and feature_flags", () => {
    const s = schema as Record<string, unknown>;
    expect(s["users"]).toBeDefined();
    expect(s["featureFlags"]).toBeDefined();
  });
});
