import { describe, it, expect } from "vitest";
import { mintJoinToken as mintNext } from "./route";
import {
  mintJoinToken as mintWorker,
  verifyJoinToken as verifyWorker,
} from "@/worker/src/auth";

const SECRET = "test-secret-hex-0123456789abcdef0123456789abcdef";

describe("join token cross-compat (Next mint <-> worker verify)", () => {
  it("Next mint verifies in worker verifyJoinToken", async () => {
    const token = await mintNext("game-cross-1", "white", SECRET);
    const payload = await verifyWorker(token, SECRET, "game-cross-1");
    expect(payload.role).toBe("white");
    expect(payload.gameId).toBe("game-cross-1");
  });

  it("worker mint verifies in worker verifyJoinToken (mint parity)", async () => {
    const token = await mintWorker("game-cross-1", "black", SECRET);
    const payload = await verifyWorker(token, SECRET, "game-cross-1");
    expect(payload.role).toBe("black");
    expect(payload.gameId).toBe("game-cross-1");
  });

  it("sub (Clerk id) round-trips; absent when not minted", async () => {
    const subbed = await mintNext("game-cross-1", "white", SECRET, 3600, "user_123");
    expect((await verifyWorker(subbed, SECRET, "game-cross-1")).sub).toBe(
      "user_123",
    );
    const plain = await mintWorker("game-cross-1", "white", SECRET);
    expect((await verifyWorker(plain, SECRET, "game-cross-1")).sub).toBeUndefined();
  });
});
