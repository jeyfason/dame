import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("cloudflare:workers", () => ({ DurableObject: class {} }));

import { mintJoinToken, verifyJoinToken } from "../src/auth";
import { parseClientFrame, FRAME_LIMIT } from "../src/protocol";
import { createInitialSnapshot, handleJoinFrame } from "../src/room";

const SECRET = "test-secret-hex-0123456789abcdef0123456789abcdef";

describe("GameRoom join/auth (Task 1 RED)", () => {
  it("join accepts valid token", async () => {
    const token = await mintJoinToken("game-123", "white", SECRET, 3600);
    const payload = await verifyJoinToken(token, SECRET, "game-123");
    expect(payload.role).toBe("white");

    const snap = createInitialSnapshot();
    expect(snap.version).toBe(0);

    const result = await handleJoinFrame(
      JSON.stringify({ t: "join", token, lastVersion: 0 }),
      { gameId: "game-123", secret: SECRET },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.role).toBe("white");
      expect(result.snapshot.version).toBe(0);
    }
  });

  it("rejects bad token", async () => {
    const result = await handleJoinFrame(
      JSON.stringify({ t: "join", token: "bad.token.here", lastVersion: 0 }),
      { gameId: "game-123", secret: SECRET },
    );
    expect(result.ok).toBe(false);
  });

  it("malformed frame closes", () => {
    expect(() => parseClientFrame("not-json{{")).toThrow();
    expect(() => parseClientFrame(JSON.stringify({ t: "nope" }))).toThrow();
    expect(() => parseClientFrame("x".repeat(FRAME_LIMIT + 1))).toThrow();
  });
});
