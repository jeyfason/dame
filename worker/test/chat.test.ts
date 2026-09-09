import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

import { mintJoinToken } from "../src/auth";
import { parseClientFrame } from "../src/protocol";
import { GameRoom } from "../src/room";

const SECRET = "test-secret-hex-0123456789abcdef0123456789abcdef";

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
    async setAlarm(t: number) {
      storage.alarmAt = t;
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
  (room as unknown as { ctx: unknown }).ctx = ctx;
  (room as unknown as { env: unknown }).env = env;
  return { room, ctx };
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

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GameRoom chat (Stage 5 Task 1 RED)", () => {
  it("parses chat + typing client frames", () => {
    expect(parseClientFrame(JSON.stringify({ t: "chat", text: "hi" }))).toEqual({
      t: "chat",
      text: "hi",
    });
    expect(parseClientFrame(JSON.stringify({ t: "typing", on: true }))).toEqual({
      t: "typing",
      on: true,
    });
  });

  it("chat broadcasts to both sockets", async () => {
    const { room } = makeRoom();
    const { white, black } = await joinBoth(room);
    await room.webSocketMessage(
      white as unknown as WebSocket,
      JSON.stringify({ t: "chat", text: "hello" }),
    );
    const w = white.sent.map((s) => JSON.parse(s)).find((f) => f.t === "chat");
    const b = black.sent.map((s) => JSON.parse(s)).find((f) => f.t === "chat");
    expect(w).toBeDefined();
    expect(b).toBeDefined();
    expect(w.from).toBe("white");
    expect(w.text).toBe("hello");
    expect(typeof w.at).toBe("number");
    expect(b.from).toBe("white");
  });

  it("500-char cap truncates", async () => {
    const { room } = makeRoom();
    const { white, black } = await joinBoth(room);
    const long = "x".repeat(600);
    await room.webSocketMessage(
      white as unknown as WebSocket,
      JSON.stringify({ t: "chat", text: long }),
    );
    const frames = [...white.sent, ...black.sent].map((s) => JSON.parse(s));
    const chat = frames.find((f) => f.t === "chat");
    expect(chat).toBeDefined();
    expect(chat.text.length).toBe(500);
  });

  it("1/sec per-socket rate limit drops burst", async () => {
    const { room } = makeRoom();
    const { white, black } = await joinBoth(room);
    const base = 1_700_000_000_000;
    const spy = vi.spyOn(Date, "now").mockReturnValue(base);
    await room.webSocketMessage(
      white as unknown as WebSocket,
      JSON.stringify({ t: "chat", text: "first" }),
    );
    // Same ms burst -> dropped.
    await room.webSocketMessage(
      white as unknown as WebSocket,
      JSON.stringify({ t: "chat", text: "second" }),
    );
    let chats = [...white.sent, ...black.sent]
      .map((s) => JSON.parse(s))
      .filter((f) => f.t === "chat");
    expect(chats.map((c) => c.text).sort()).toEqual(["first", "first"]);
    // After 1.1s -> allowed.
    spy.mockReturnValue(base + 1100);
    await room.webSocketMessage(
      white as unknown as WebSocket,
      JSON.stringify({ t: "chat", text: "third" }),
    );
    chats = [...white.sent, ...black.sent]
      .map((s) => JSON.parse(s))
      .filter((f) => f.t === "chat");
    expect(chats.map((c) => c.text).sort()).toEqual([
      "first",
      "first",
      "third",
      "third",
    ]);
  });

  it("last-50 replayed on join", async () => {
    const { room, ctx } = makeRoom();
    const { white } = await joinBoth(room);
    let now = 1_700_000_000_000;
    const spy = vi.spyOn(Date, "now").mockImplementation(() => now);
    for (let i = 0; i < 55; i++) {
      now += 1100;
      await room.webSocketMessage(
        white as unknown as WebSocket,
        JSON.stringify({ t: "chat", text: `m${i}` }),
      );
    }
    spy.mockRestore();
    white.sent.length = 0;
    // New spectator socket joins as white (same role, new connection).
    const rejoin = makeFakeSocket();
    ctx.sockets.push(rejoin);
    const token = await mintJoinToken("game-123", "white", SECRET, 3600);
    await room.webSocketMessage(
      rejoin as unknown as WebSocket,
      JSON.stringify({ t: "join", token, lastVersion: 0 }),
    );
    const chats = rejoin.sent.map((s) => JSON.parse(s)).filter((f) => f.t === "chat");
    expect(chats.length).toBe(50);
    expect(chats[0].text).toBe("m5");
    expect(chats[49].text).toBe("m54");
  });

  it("typing broadcasts + auto-times-out", async () => {
    const { room } = makeRoom();
    const { white, black } = await joinBoth(room);
    const base = 1_700_000_000_000;
    const spy = vi.spyOn(Date, "now").mockReturnValue(base);
    await room.webSocketMessage(
      white as unknown as WebSocket,
      JSON.stringify({ t: "typing", on: true }),
    );
    let t = black.sent.map((s) => JSON.parse(s)).find((f) => f.t === "typing");
    expect(t).toBeDefined();
    expect(t.from).toBe("white");
    expect(t.on).toBe(true);
    black.sent.length = 0;
    white.sent.length = 0;
    // Advance past 5s timeout, any next frame triggers expiry broadcast.
    spy.mockReturnValue(base + 6000);
    await room.webSocketMessage(
      black as unknown as WebSocket,
      JSON.stringify({ t: "typing", on: false }),
    );
    // Expiry of white's stale typing + black's explicit off both visible;
    // at minimum white off must have been broadcast.
    const offs = [...white.sent, ...black.sent]
      .map((s) => JSON.parse(s))
      .filter((f) => f.t === "typing" && f.on === false);
    expect(offs.some((f) => f.from === "white")).toBe(true);
  });

  it("malformed chat drops without closing", async () => {
    const { room } = makeRoom();
    const { white, black } = await joinBoth(room);
    await room.webSocketMessage(
      white as unknown as WebSocket,
      JSON.stringify({ t: "chat" }),
    );
    expect(white.closed).toBeUndefined();
    const chats = [...white.sent, ...black.sent]
      .map((s) => JSON.parse(s))
      .filter((f) => f.t === "chat");
    expect(chats.length).toBe(0);
  });
});
