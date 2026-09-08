import { describe, it, expect, beforeEach } from "vitest";
import { GET } from "./route";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

// gameId is UUIDv4 everywhere (creation mints, join requires, finish route +
// uuid PKs consume). Non-UUID ids are rejected at member join.
describe("api/room gameId format", () => {
  beforeEach(() => {
    process.env.E2E_BYPASS_AUTH = "1";
    process.env.GAME_TOKEN_SECRET = "test-room-secret";
  });

  it("GET rejects non-UUID gameId", async () => {
    const res = await GET(
      new Request("http://localhost/api/room?gameId=game-123&role=white"),
    );
    expect(res.status).toBe(400);
  });

  it("GET mints for UUID gameId", async () => {
    const res = await GET(
      new Request(`http://localhost/api/room?gameId=${UUID}&role=white`),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { gameId: string; token: string };
    expect(json.gameId).toBe(UUID);
    expect(typeof json.token).toBe("string");
  });
});
