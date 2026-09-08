import { describe, it, expect } from "vitest";
import * as schema from "../lib/db/schema";

describe("schema v2 ratings", () => {
  it("exports users, featureFlags, games, ratings, rating_history, invites", () => {
    const s = schema as Record<string, unknown>;
    expect(s["users"]).toBeDefined();
    expect(s["featureFlags"]).toBeDefined();
    expect(s["games"]).toBeDefined();
    expect(s["ratings"]).toBeDefined();
    expect(s["ratingHistory"]).toBeDefined();
    expect(s["invites"]).toBeDefined();
  });
});
