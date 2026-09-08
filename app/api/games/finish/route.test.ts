import { describe, it, expect, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { handleFinish } from "./route";
import type {
  FinishStore,
  GameInput,
  GameRow,
  HistoryRow,
  RatingState,
} from "@/lib/ratings/update";
import { DEFAULT_RATING, DEFAULT_RD, DEFAULT_VOL } from "@/lib/ratings/glicko2";

const SECRET = "test-finish-worker-secret";
const GAME_ID = "123e4567-e89b-12d3-a456-426614174000";

function signBody(raw: string): string {
  return createHmac("sha256", SECRET).update(raw).digest("hex");
}

function authedRequest(body: unknown, sig?: string): Request {
  const raw = JSON.stringify(body);
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (sig !== undefined) headers["x-worker-signature"] = sig;
  return new Request("http://localhost/api/games/finish", {
    method: "POST",
    headers,
    body: raw,
  });
}

/** In-memory FinishStore: no live DB required. */
class MemoryStore implements FinishStore {
  games = new Map<string, GameRow>();
  ratings = new Map<string, RatingState>();
  history: HistoryRow[] = [];

  async findGame(gameId: string): Promise<GameRow | null> {
    return this.games.get(gameId) ?? null;
  }
  async insertGame(game: GameInput): Promise<boolean> {
    if (this.games.has(game.gameId)) return false;
    this.games.set(game.gameId, { ...game, finishedAt: new Date() });
    return true;
  }
  async getRating(clerkId: string): Promise<RatingState> {
    return (
      this.ratings.get(clerkId) ?? {
        rating: DEFAULT_RATING,
        rd: DEFAULT_RD,
        vol: DEFAULT_VOL,
        gamesPlayed: 0,
      }
    );
  }
  async saveRating(clerkId: string, r: RatingState): Promise<void> {
    this.ratings.set(clerkId, r);
  }
  async addHistory(row: HistoryRow): Promise<void> {
    // Idempotent like the Drizzle unique (game, clerk) index.
    if (
      !this.history.some(
        (h) => h.gameId === row.gameId && h.clerkId === row.clerkId,
      )
    ) {
      this.history.push(row);
    }
  }
  async historyForGame(gameId: string): Promise<HistoryRow[]> {
    return this.history.filter((h) => h.gameId === gameId);
  }
}

const deps = (store: FinishStore) => ({
  store,
  clerkAuth: async () => null as string | null,
});

const validBody = () => ({
  gameId: GAME_ID,
  whiteClerkId: "user_white",
  blackClerkId: "user_black",
  winner: "white",
  reason: "resign",
  moves: [],
});

describe("games/finish", () => {
  beforeEach(() => {
    process.env.GAME_TOKEN_SECRET = SECRET;
  });

  it("401 with no worker HMAC and no Clerk session (fail-closed)", async () => {
    const res = await handleFinish(
      authedRequest(validBody(), undefined),
      deps(new MemoryStore()),
    );
    expect(res.status).toBe(401);
  });

  it("401 on bad worker signature", async () => {
    const res = await handleFinish(
      authedRequest(validBody(), "deadbeef"),
      deps(new MemoryStore()),
    );
    expect(res.status).toBe(401);
  });

  it("400 on invalid gameId and winner", async () => {
    const store = new MemoryStore();
    const badId = await handleFinish(
      authedRequest({ ...validBody(), gameId: "not-a-uuid" }, signBody(JSON.stringify({ ...validBody(), gameId: "not-a-uuid" }))),
      deps(store),
    );
    expect(badId.status).toBe(400);
    const badWinner = await handleFinish(
      authedRequest(
        { ...validBody(), winner: "green" },
        signBody(JSON.stringify({ ...validBody(), winner: "green" })),
      ),
      deps(store),
    );
    expect(badWinner.status).toBe(400);
  });

  it("accepts WebCrypto-produced worker signatures (worker interop)", async () => {
    const body = validBody();
    const raw = JSON.stringify(body);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBytes = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)),
    );
    const hex = [...sigBytes]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const res = await handleFinish(
      authedRequest(body, hex),
      deps(new MemoryStore()),
    );
    expect(res.status).toBe(200);
  });

  it("finish twice same gameId → one game row (idempotent)", async () => {
    const store = new MemoryStore();
    const body = validBody();
    const raw = JSON.stringify(body);
    const sig = signBody(raw);
    const first = await handleFinish(authedRequest(body, sig), deps(store));
    expect(first.status).toBe(200);
    const second = await handleFinish(authedRequest(body, sig), deps(store));
    expect(second.status).toBe(200);
    expect(store.games.size).toBe(1);
    expect(store.history.length).toBe(2);
    const json = (await second.json()) as { duplicate: boolean };
    expect(json.duplicate).toBe(true);
  });

  it("crash between insertGame and history recovers on retry (no zero-delta success)", async () => {
    const store = new MemoryStore();
    const body = validBody();
    // Simulate the crash: game row persisted, ratings/history untouched.
    const inserted = await store.insertGame({
      gameId: body.gameId,
      whiteClerkId: body.whiteClerkId,
      blackClerkId: body.blackClerkId,
      winner: "white",
      reason: body.reason,
      moves: [],
    });
    expect(inserted).toBe(true);
    const sig = signBody(JSON.stringify(body));
    const res = await handleFinish(authedRequest(body, sig), deps(store));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      duplicate: boolean;
      white: { before: RatingState; after: RatingState };
      black: { before: RatingState; after: RatingState };
    };
    expect(json.duplicate).toBe(true);
    // Recovered: winner up, loser down, history written — not zero deltas.
    expect(json.white.after.rating).toBeGreaterThan(json.white.before.rating);
    expect(json.black.after.rating).toBeLessThan(json.black.before.rating);
    expect(store.history.length).toBe(2);
    // Next retry: history present → zero-delta duplicate, no double-apply.
    const again = await handleFinish(authedRequest(body, sig), deps(store));
    expect(again.status).toBe(200);
    const j2 = (await again.json()) as {
      duplicate: boolean;
      white: { before: RatingState; after: RatingState };
    };
    expect(j2.duplicate).toBe(true);
    expect(j2.white.after.rating).toBe(json.white.after.rating);
    expect(j2.white.before.rating).toBe(json.white.after.rating);
    expect(store.history.length).toBe(2);
  });

  it("Clerk third-user 403 (not a participant)", async () => {
    const store = new MemoryStore();
    const body = validBody();
    const res = await handleFinish(authedRequest(body, undefined), {
      store,
      clerkAuth: async () => "user_intruder",
    });
    expect(res.status).toBe(403);
  });

  it("Clerk participant 200 (white posts own finish)", async () => {
    const store = new MemoryStore();
    const body = validBody();
    const res = await handleFinish(authedRequest(body, undefined), {
      store,
      clerkAuth: async () => "user_white",
    });
    expect(res.status).toBe(200);
  });

  it("winner rating up, loser down; new-player RD shrinks; deltas returned", async () => {
    const store = new MemoryStore();
    const body = validBody();
    const res = await handleFinish(
      authedRequest(body, signBody(JSON.stringify(body))),
      deps(store),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      white: { before: RatingState; after: RatingState };
      black: { before: RatingState; after: RatingState };
    };
    expect(json.ok).toBe(true);
    expect(json.white.after.rating).toBeGreaterThan(json.white.before.rating);
    expect(json.black.after.rating).toBeLessThan(json.black.before.rating);
    expect(json.white.after.rd).toBeLessThan(DEFAULT_RD);
    expect(json.black.after.rd).toBeLessThan(DEFAULT_RD);
  });
});
