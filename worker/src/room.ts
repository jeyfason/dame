import { DurableObject } from "cloudflare:workers";
import {
  applyMove,
  initialBoard,
  legalMoves,
} from "../../lib/rules/international";
import type { GameState, Move } from "../../lib/rules/types";
import { verifyJoinToken } from "./auth";
import {
  ProtocolError,
  encodeServerFrame,
  parseClientFrame,
  type Role,
} from "./protocol";

export interface RoomSnapshot {
  state: GameState;
  version: number;
}

export interface JoinContext {
  gameId: string;
  secret: string;
}

export type JoinResult =
  | { ok: true; role: Role; snapshot: RoomSnapshot }
  | { ok: false; reason: string };

export function createInitialSnapshot(): RoomSnapshot {
  return { state: initialBoard(), version: 0 };
}

// --- Authoritative move decision (pure, bundle-safe) ---
//
// DO decision is final: callers pass the current snapshot + claimant role.
// Checks run in protocol order: game-over, stale baseVersion, turn, legality.

export type MoveDecision =
  | { ok: true; state: GameState; version: number }
  | { ok: false; reason: string; state: GameState; version: number };

export function decideMove(
  snapshot: RoomSnapshot,
  role: Role,
  move: Move,
  baseVersion: number,
): MoveDecision {
  if (snapshot.state.winner) {
    return {
      ok: false,
      reason: "game over",
      state: snapshot.state,
      version: snapshot.version,
    };
  }
  if (baseVersion !== snapshot.version) {
    return {
      ok: false,
      reason: "stale version",
      state: snapshot.state,
      version: snapshot.version,
    };
  }
  if (role !== snapshot.state.turn) {
    return {
      ok: false,
      reason: "not your turn",
      state: snapshot.state,
      version: snapshot.version,
    };
  }
  const legal = legalMoves(snapshot.state);
  const match = legal.find(
    (m) =>
      m.from[0] === move.from[0] &&
      m.from[1] === move.from[1] &&
      m.to[0] === move.to[0] &&
      m.to[1] === move.to[1] &&
      m.captures.length === move.captures.length &&
      m.captures.every(
        (c, i) => c[0] === move.captures[i]?.[0] && c[1] === move.captures[i]?.[1],
      ),
  );
  if (!match) {
    return {
      ok: false,
      reason: "illegal move",
      state: snapshot.state,
      version: snapshot.version,
    };
  }
  try {
    const next = applyMove(snapshot.state, move);
    return { ok: true, state: next, version: snapshot.version + 1 };
  } catch {
    return {
      ok: false,
      reason: "illegal move",
      state: snapshot.state,
      version: snapshot.version,
    };
  }
}

/** Pure join helper — unit-tested without workerd. Throws ProtocolError on malformed. */
export async function handleJoinFrame(
  raw: string,
  ctx: JoinContext,
): Promise<JoinResult> {
  const frame = parseClientFrame(raw);
  if (frame.t !== "join") {
    throw new ProtocolError("expected join as first frame", 1003);
  }
  try {
    const payload = await verifyJoinToken(frame.token, ctx.secret, ctx.gameId);
    return {
      ok: true,
      role: payload.role,
      snapshot: createInitialSnapshot(),
    };
  } catch {
    return { ok: false, reason: "unauthorized" };
  }
}

// --- Durable Object ---

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
  GAME_TOKEN_SECRET: string;
  CLERK_JWKS_URL: string;
}

interface Attachment {
  role: Role | null;
  joined: boolean;
  gameId?: string;
}

export const RECONNECT_GRACE_MS = 120_000;

export class GameRoom extends DurableObject<Env> {
  private gameState: GameState = initialBoard();
  private version = 0;
  private history: Move[] = [];
  private lastSeen = new Map<Role, number>();
  private disconnectedAt = new Map<Role, number>();
  private gameId: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ensureSchema();
      this.loadPersisted();
    });
  }

  private ensureSchema() {
    try {
      const sql = (
        this.ctx as unknown as {
          storage?: { sql?: { exec: (q: string, ...args: unknown[]) => unknown } };
        }
      ).storage?.sql;
      sql?.exec(
        `CREATE TABLE IF NOT EXISTS room_state (id INTEGER PRIMARY KEY CHECK (id = 1), state TEXT NOT NULL, version INTEGER NOT NULL, history TEXT NOT NULL)`,
      );
    } catch {
      // storage.sql unavailable (unit tests) — stay in-memory.
    }
  }

  private loadPersisted() {
    try {
      const sql = (
        this.ctx as unknown as {
          storage?: {
            sql?: {
              exec: <T>(q: string, ...args: unknown[]) => { toArray: () => T[] };
            };
          };
        }
      ).storage?.sql;
      if (!sql) return;
      const rows = sql
        .exec<{ state: string; version: number; history: string }>(
          `SELECT state, version, history FROM room_state WHERE id = 1`,
        )
        .toArray();
      const row = rows[0];
      if (row) {
        this.gameState = JSON.parse(row.state) as GameState;
        this.version = row.version;
        this.history = JSON.parse(row.history) as Move[];
      }
    } catch {
      // keep in-memory initial state
    }
  }

  private persist() {
    try {
      const sql = (
        this.ctx as unknown as {
          storage?: { sql?: { exec: (q: string, ...args: unknown[]) => unknown } };
        }
      ).storage?.sql;
      sql?.exec(
        `INSERT OR REPLACE INTO room_state (id, state, version, history) VALUES (1, ?, ?, ?)`,
        JSON.stringify(this.gameState),
        this.version,
        JSON.stringify(this.history),
      );
    } catch {
      // in-memory fallback for tests
    }
  }

  override async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    // Bind this DO instance to the gameId in the URL so join tokens can be
    // scoped per game (mirrors handleJoinFrame's expectedGameId check and
    // blocks cross-game token reuse: token for game-A rejected on game-B).
    try {
      const pathname = new URL(request.url).pathname;
      const m = pathname.match(/^\/room\/([^/]+)\/ws$/);
      if (m?.[1]) this.gameId = decodeURIComponent(m[1]);
    } catch {
      // keep this.gameId null; webSocketMessage then verifies without scope
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      role: null,
      joined: false,
      gameId: this.gameId ?? undefined,
    } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const raw =
      typeof message === "string" ? message : new TextDecoder().decode(message);
    const att = (ws.deserializeAttachment() ?? {
      role: null,
      joined: false,
    }) as Attachment;
    try {
      const frame = parseClientFrame(raw);
      if (frame.t === "join") {
        const secret = (this.env as Env).GAME_TOKEN_SECRET ?? "";
        // Scope verification to this game (mirrors handleJoinFrame helper).
        const expectedGameId = att.gameId ?? this.gameId ?? undefined;
        const payload = await verifyJoinToken(
          frame.token,
          secret,
          expectedGameId ?? undefined,
        ).catch(() => null);
        if (!payload) {
          ws.send(
            encodeServerFrame({
              t: "reject",
              reason: "unauthorized",
              state: this.gameState,
              version: this.version,
            }),
          );
          ws.close(1008, "unauthorized");
          return;
        }
        const role: Role = payload.role;
        ws.serializeAttachment({
          role,
          joined: true,
          gameId: att.gameId ?? this.gameId ?? undefined,
        } satisfies Attachment);
        this.lastSeen.set(role, Date.now());
        this.disconnectedAt.delete(role);
        if (this.disconnectedAt.size === 0) {
          try {
            await this.ctx.storage.deleteAlarm();
          } catch {
            // no alarm backend (unit tests)
          }
        }
        // Resync: always send the authoritative snapshot. A stale
        // lastVersion means the client missed moves — current state covers it.
        ws.send(
          encodeServerFrame({ t: "state", state: this.gameState, version: this.version }),
        );
        this.broadcastPresence();
        return;
      }
      if (!att.joined || !att.role) {
        ws.close(1008, "join first");
        return;
      }
      if (frame.t !== "move") {
        ws.close(1003, "malformed frame");
        return;
      }
      const decision = decideMove(
        { state: this.gameState, version: this.version },
        att.role,
        frame.move,
        frame.baseVersion,
      );
      if (!decision.ok) {
        ws.send(
          encodeServerFrame({
            t: "reject",
            reason: decision.reason,
            state: this.gameState,
            version: this.version,
          }),
        );
        return;
      }
      this.gameState = decision.state;
      this.version = decision.version;
      this.history.push(frame.move);
      this.persist();
      this.broadcastState();
      if (this.gameState.winner) {
        this.broadcastEnd(this.gameState.winner, "win");
      }
    } catch (err) {
      const code = err instanceof ProtocolError ? err.closeCode : 1003;
      try {
        ws.close(code, "malformed frame");
      } catch {
        // already closed
      }
    }
  }

  override async webSocketClose(ws: WebSocket, _code?: number, _reason?: string) {
    void _code;
    void _reason;
    const att = ws.deserializeAttachment() as Attachment | null;
    if (att?.role) {
      const now = Date.now();
      this.lastSeen.set(att.role, now);
      // 120s reconnect grace: state + version + history are retained so a
      // rejoin with a stale lastVersion resyncs. Presence flips to offline
      // immediately; the alarm only expires the grace bookkeeping.
      this.disconnectedAt.set(att.role, now);
      try {
        await this.ctx.storage.setAlarm(now + RECONNECT_GRACE_MS);
      } catch {
        // no alarm backend (unit tests use a fake)
      }
    }
    this.broadcastPresence();
  }

  override async alarm(): Promise<void> {
    const now = Date.now();
    let earliest: number | null = null;
    for (const [role, at] of this.disconnectedAt) {
      if (now - at >= RECONNECT_GRACE_MS) {
        this.disconnectedAt.delete(role);
      } else {
        const expiry = at + RECONNECT_GRACE_MS;
        if (earliest === null || expiry < earliest) earliest = expiry;
      }
    }
    this.broadcastPresence();
    if (earliest !== null) {
      try {
        await this.ctx.storage.setAlarm(earliest);
      } catch {
        // ignore (unit tests)
      }
    }
  }

  private connectedRoles(): Set<Role> {
    const roles = new Set<Role>();
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att?.joined && att.role) roles.add(att.role);
    }
    return roles;
  }

  private broadcastState() {
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att?.joined || !att.role) continue;
      try {
        ws.send(
          encodeServerFrame({
            t: "state",
            state: this.gameState,
            version: this.version,
          }),
        );
      } catch {
        // ignore send to closing socket
      }
    }
  }

  private broadcastEnd(winner: "white" | "black", reason: string) {
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att?.joined || !att.role) continue;
      try {
        ws.send(encodeServerFrame({ t: "end", winner, reason }));
      } catch {
        // ignore send to closing socket
      }
    }
  }

  private broadcastPresence() {
    const connected = this.connectedRoles();
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att?.joined || !att.role) continue;
      const opponent: Role = att.role === "white" ? "black" : "white";
      try {
        ws.send(
          encodeServerFrame({
            t: "presence",
            you: att.role,
            opponentConnected: connected.has(opponent),
          }),
        );
      } catch {
        // ignore send to closing socket
      }
    }
  }
}
