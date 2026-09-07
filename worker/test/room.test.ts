import { describe, it, expect, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    ctx: unknown;
    env: unknown;
    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

import { mintJoinToken, verifyJoinToken, verifyClerkToken } from "../src/auth";
import { parseClientFrame, FRAME_LIMIT } from "../src/protocol";
import { createInitialSnapshot, handleJoinFrame, GameRoom } from "../src/room";
import { legalMoves } from "../../lib/rules/international";
import type { GameState, Move } from "../../lib/rules/types";

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

  it("rejects cross-game token reuse (game-A token on game-B)", async () => {
    const token = await mintJoinToken("game-A", "white", SECRET, 3600);
    await expect(verifyJoinToken(token, SECRET, "game-B")).rejects.toThrow(
      "token game mismatch",
    );
    const result = await handleJoinFrame(JSON.stringify({ t: "join", token }), {
      gameId: "game-B",
      secret: SECRET,
    });
    expect(result.ok).toBe(false);
  });

  it("malformed frame closes", () => {
    expect(() => parseClientFrame("not-json{{")).toThrow();
    expect(() => parseClientFrame(JSON.stringify({ t: "nope" }))).toThrow();
    expect(() => parseClientFrame("x".repeat(FRAME_LIMIT + 1))).toThrow();
  });

  it("verifyClerkToken good/bad/expired with stubbed fetchImpl", async () => {
    const b64url = (obj: unknown) =>
      Buffer.from(JSON.stringify(obj))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    const keypair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    const pubJwk = (await crypto.subtle.exportKey(
      "jwk",
      keypair.publicKey,
    )) as JsonWebKey & { kid?: string };
    pubJwk.kid = "test-kid";
    const jwksUrl = "https://clerk.test/.well-known/jwks.json";
    const fetchImpl = (async () =>
      ({
        ok: true,
        json: async () => ({ keys: [pubJwk] }),
      }) as unknown as Response) as typeof fetch;
    const sign = async (header: object, claims: object) => {
      const h = b64url(header);
      const p = b64url(claims);
      const sig = new Uint8Array(
        await crypto.subtle.sign(
          "RSASSA-PKCS1-v1_5",
          keypair.privateKey,
          new TextEncoder().encode(`${h}.${p}`),
        ),
      );
      const sigB64 = Buffer.from(sig)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      return `${h}.${p}.${sigB64}`;
    };
    const now = Math.floor(Date.now() / 1000);
    // good
    const good = await sign(
      { alg: "RS256", kid: "test-kid", typ: "JWT" },
      { sub: "user_123", exp: now + 600 },
    );
    const claims = await verifyClerkToken(good, jwksUrl, fetchImpl);
    expect(claims.sub).toBe("user_123");
    // bad signature
    const bad = `${good.slice(0, -1)}${good.endsWith("A") ? "B" : "A"}`;
    await expect(verifyClerkToken(bad, jwksUrl, fetchImpl)).rejects.toThrow();
    // expired
    const expired = await sign(
      { alg: "RS256", kid: "test-kid", typ: "JWT" },
      { sub: "user_123", exp: now - 10 },
    );
    await expect(
      verifyClerkToken(expired, jwksUrl, fetchImpl),
    ).rejects.toThrow("jwt expired");
  });
});

// --- Task 2 RED: authoritative moves + resync + win + grace ---

type FakeSocket = {
  sent: string[];
  closed?: { code: number; reason: string };
  attachment: unknown;
  send(msg: string): void;
  close(code: number, reason: string): void;
  serializeAttachment(v: unknown): void;
  deserializeAttachment(): unknown;
};

function makeFakeSocket(): FakeSocket {
  const s: FakeSocket = {
    sent: [],
    attachment: null,
    send(msg: string) {
      s.sent.push(msg);
    },
    close(code: number, reason: string) {
      s.closed = { code, reason };
    },
    serializeAttachment(v: unknown) {
      s.attachment = v;
    },
    deserializeAttachment() {
      return s.attachment;
    },
  };
  return s;
}

function makeFakeCtx() {
  const sockets: FakeSocket[] = [];
  const storage = {
    alarmAt: null as number | null,
    setAlarmCalls: 0,
    async setAlarm(t: number) {
      storage.alarmAt = t;
      storage.setAlarmCalls++;
    },
    async getAlarm() {
      return storage.alarmAt;
    },
    async deleteAlarm() {
      storage.alarmAt = null;
    },
  };
  return {
    sockets,
    storage,
    async blockConcurrencyWhile<T>(fn: () => Promise<T> | T): Promise<T> {
      return await fn();
    },
    getWebSockets(): FakeSocket[] {
      return [...sockets];
    },
  };
}

function makeRoom() {
  const ctx = makeFakeCtx();
  const env = {
    GAME_TOKEN_SECRET: SECRET,
    CLERK_JWKS_URL: "https://clerk.test/.well-known/jwks.json",
  };
  const room = new GameRoom(
    ctx as unknown as DurableObjectState,
    env as unknown as never,
  );
  // Wire fakes onto DO base (mocked base stores ctx/env, but be explicit).
  (room as unknown as { ctx: unknown }).ctx = ctx;
  (room as unknown as { env: unknown }).env = env;
  return { room, ctx, env };
}

async function joinBoth(room: GameRoom, gameId = "game-123") {
  const whiteToken = await mintJoinToken(gameId, "white", SECRET, 3600);
  const blackToken = await mintJoinToken(gameId, "black", SECRET, 3600);
  const white = makeFakeSocket();
  const black = makeFakeSocket();
  const ctxOf = (room as unknown as { ctx: { sockets: FakeSocket[] } }).ctx;
  ctxOf.sockets.push(white, black);
  await room.webSocketMessage(
    white as unknown as WebSocket,
    JSON.stringify({ t: "join", token: whiteToken }),
  );
  await room.webSocketMessage(
    black as unknown as WebSocket,
    JSON.stringify({ t: "join", token: blackToken }),
  );
  white.sent.length = 0;
  black.sent.length = 0;
  return { white, black };
}

function winSetupState(): GameState {
  const board: GameState["board"] = Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => null),
  );
  board[5]![2] = { color: "white", kind: "man" };
  board[4]![3] = { color: "black", kind: "man" };
  return { board, turn: "white", winner: null };
}

describe("GameRoom authoritative moves (Task 2 RED)", () => {
  it("pure decideMove helper exists (DO decision final via lib/rules)", async () => {
    const mod = (await import("../src/room")) as Record<string, unknown>;
    expect(mod.decideMove).toBeDefined();
  });

  it("legal move broadcasts version+1 to both sockets", async () => {
    const { room } = makeRoom();
    const { white, black } = await joinBoth(room);
    const snap = createInitialSnapshot();
    const move: Move = legalMoves(snap.state)[0]!;
    await room.webSocketMessage(
      white as unknown as WebSocket,
      JSON.stringify({ t: "move", move, baseVersion: 0 }),
    );
    const wFrames = white.sent.map((s) => JSON.parse(s));
    const bFrames = black.sent.map((s) => JSON.parse(s));
    const wState = wFrames.find((f) => f.t === "state");
    const bState = bFrames.find((f) => f.t === "state");
    expect(wState).toBeDefined();
    expect(bState).toBeDefined();
    expect(wState.version).toBe(1);
    expect(bState.version).toBe(1);
    expect((room as unknown as { history: Move[] }).history.length).toBe(1);
  });

  it("illegal move -> reject + snapshot, no version bump", async () => {
    const { room } = makeRoom();
    const { white, black } = await joinBoth(room);
    const illegal: Move = {
      from: [0, 0],
      to: [1, 1],
      captures: [],
      promotes: false,
    };
    await room.webSocketMessage(
      white as unknown as WebSocket,
      JSON.stringify({ t: "move", move: illegal, baseVersion: 0 }),
    );
    const wFrames = white.sent.map((s) => JSON.parse(s));
    const reject = wFrames.find((f) => f.t === "reject");
    expect(reject).toBeDefined();
    expect(reject.reason).toMatch(/illegal/i);
    expect(reject.version).toBe(0);
    expect(reject.state).toBeDefined();
    expect(black.sent.map((s) => JSON.parse(s)).find((f) => f.t === "state")).toBeUndefined();
  });

  it("wrong turn -> reject not your turn", async () => {
    const { room } = makeRoom();
    const { black } = await joinBoth(room);
    const snap = createInitialSnapshot();
    const whiteMove: Move = legalMoves(snap.state)[0]!;
    await room.webSocketMessage(
      black as unknown as WebSocket,
      JSON.stringify({ t: "move", move: whiteMove, baseVersion: 0 }),
    );
    const frames = black.sent.map((s) => JSON.parse(s));
    const reject = frames.find((f) => f.t === "reject");
    expect(reject).toBeDefined();
    expect(reject.reason).toMatch(/turn/i);
  });

  it("stale baseVersion -> reject + snapshot", async () => {
    const { room } = makeRoom();
    const { white, black } = await joinBoth(room);
    const snap = createInitialSnapshot();
    const first: Move = legalMoves(snap.state)[0]!;
    await room.webSocketMessage(
      white as unknown as WebSocket,
      JSON.stringify({ t: "move", move: first, baseVersion: 0 }),
    );
    white.sent.length = 0;
    black.sent.length = 0;
    await room.webSocketMessage(
      black as unknown as WebSocket,
      JSON.stringify({ t: "move", move: first, baseVersion: 0 }),
    );
    const frames = black.sent.map((s) => JSON.parse(s));
    const reject = frames.find((f) => f.t === "reject");
    expect(reject).toBeDefined();
    expect(reject.reason).toMatch(/stale/i);
    expect(reject.version).toBe(1);
    expect(reject.state).toBeDefined();
  });

  it("win -> end frame with winner", async () => {
    const { room } = makeRoom();
    const { white, black } = await joinBoth(room);
    (room as unknown as { gameState: GameState }).gameState = winSetupState();
    (room as unknown as { version: number }).version = 0;
    (room as unknown as { history: Move[] }).history = [];
    white.sent.length = 0;
    black.sent.length = 0;
    const winning: Move = {
      from: [5, 2],
      to: [3, 4],
      captures: [[4, 3]],
      promotes: false,
    };
    await room.webSocketMessage(
      white as unknown as WebSocket,
      JSON.stringify({ t: "move", move: winning, baseVersion: 0 }),
    );
    const wFrames = white.sent.map((s) => JSON.parse(s));
    const bFrames = black.sent.map((s) => JSON.parse(s));
    const end = [...wFrames, ...bFrames].find((f) => f.t === "end");
    expect(end).toBeDefined();
    expect(end.winner).toBe("white");
  });

  it("rejoin with stale lastVersion resyncs to latest snapshot", async () => {
    const { room, ctx } = makeRoom();
    const { white } = await joinBoth(room);
    const snap = createInitialSnapshot();
    const first: Move = legalMoves(snap.state)[0]!;
    await room.webSocketMessage(
      white as unknown as WebSocket,
      JSON.stringify({ t: "move", move: first, baseVersion: 0 }),
    );
    const rejoin = makeFakeSocket();
    ctx.sockets.push(rejoin);
    const token = await mintJoinToken("game-123", "white", SECRET, 3600);
    await room.webSocketMessage(
      rejoin as unknown as WebSocket,
      JSON.stringify({ t: "join", token, lastVersion: 0 }),
    );
    const frames = rejoin.sent.map((s) => JSON.parse(s));
    const state = frames.find((f) => f.t === "state");
    expect(state).toBeDefined();
    expect(state.version).toBe(1);
  });

  it("disconnect schedules DO alarm for 120s grace (no setTimeout)", async () => {
    const { room, ctx } = makeRoom();
    const { white } = await joinBoth(room);
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    await room.webSocketClose(white as unknown as WebSocket, 1000, "bye");
    expect(ctx.storage.setAlarmCalls).toBeGreaterThan(0);
    expect(ctx.storage.alarmAt).not.toBeNull();
    const delta = (ctx.storage.alarmAt as number) - Date.now();
    expect(delta).toBeGreaterThan(100_000);
    expect(delta).toBeLessThanOrEqual(125_000);
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
    expect(typeof (room as unknown as { alarm?: unknown }).alarm).toBe("function");
  });
});

describe("POST /room requires Clerk session (Task 2 RED)", () => {
  it("rejects open mint without Authorization", async () => {
    const worker = (await import("../src/index")).default;
    const res = await worker.fetch(
      new Request("https://test/room", { method: "POST" }),
      {
        GAME_ROOM: {} as never,
        GAME_TOKEN_SECRET: SECRET,
        CLERK_JWKS_URL: "https://clerk.test/.well-known/jwks.json",
      },
    );
    expect(res.status).toBe(401);
  });

  it("rejects invalid Clerk JWT with 401", async () => {
    const worker = (await import("../src/index")).default;
    const res = await worker.fetch(
      new Request("https://test/room", {
        method: "POST",
        headers: { Authorization: "Bearer bad.jwt.token" },
      }),
      {
        GAME_ROOM: {} as never,
        GAME_TOKEN_SECRET: SECRET,
        CLERK_JWKS_URL: "https://clerk.test/.well-known/jwks.json",
      },
    );
    expect(res.status).toBe(401);
  });
});
