import { describe, it, expect } from "vitest";

import { buildFinishBody } from "@/lib/finish/body";
import { parseFinishBody } from "./route";

const GAME_ID = "123e4567-e89b-12d3-a456-426614174000";

// Worker->route contract: the exact broadcastEnd body must pass the route's
// finish validation, so rated games never 400 on format. buildFinishBody is
// the same builder GameRoom.broadcastEnd uses (worker suite covers the
// broadcast wiring: clerkIds present, version absent, HMAC-signed).
describe("worker->route finish contract", () => {
  it("broadcastEnd body passes parseFinishBody", () => {
    const raw = buildFinishBody({
      gameId: GAME_ID,
      whiteClerkId: "user_white",
      blackClerkId: "user_black",
      winner: "white",
      reason: "win",
      moves: [
        { from: [5, 2], to: [3, 4], captures: [[4, 3]], promotes: false },
      ],
    });
    const parsed = parseFinishBody(JSON.parse(raw) as unknown);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.input.gameId).toBe(GAME_ID);
      expect(parsed.input.whiteClerkId).toBe("user_white");
      expect(parsed.input.blackClerkId).toBe("user_black");
      expect(parsed.input.winner).toBe("white");
      expect(parsed.input.moves).toHaveLength(1);
    }
  });

  it("draw body passes parseFinishBody (rated draw)", () => {
    const raw = buildFinishBody({
      gameId: GAME_ID,
      whiteClerkId: "user_white",
      blackClerkId: "user_black",
      winner: "draw",
      reason: "agreement",
      moves: [],
    });
    const parsed = parseFinishBody(JSON.parse(raw) as unknown);
    expect(parsed.ok).toBe(true);
  });

  it("body carries no internal version field", () => {
    const raw = buildFinishBody({
      gameId: GAME_ID,
      whiteClerkId: "user_white",
      blackClerkId: "user_black",
      winner: "black",
      reason: "resign",
      moves: [],
    });
    expect(JSON.parse(raw) as Record<string, unknown>).not.toHaveProperty(
      "version",
    );
  });
});
