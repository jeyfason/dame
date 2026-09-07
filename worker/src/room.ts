import { DurableObject } from "cloudflare:workers";
import { initialBoard } from "../../lib/rules/international";
import type { GameState } from "../../lib/rules/types";
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
}

const RECONNECT_GRACE_MS = 120_000;

export class GameRoom extends DurableObject<Env> {
  private gameState: GameState = initialBoard();
  private version = 0;
  private lastSeen = new Map<Role, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Schema setup only; Task 2 adds SQLite persistence.
    ctx.blockConcurrencyWhile(async () => {});
  }

  override async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ role: null, joined: false } satisfies Attachment);
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
        const payload = await verifyJoinToken(frame.token, secret).catch(
          () => null,
        );
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
        ws.serializeAttachment({ role, joined: true } satisfies Attachment);
        this.lastSeen.set(role, Date.now());
        ws.send(
          encodeServerFrame({ t: "state", state: this.gameState, version: this.version }),
        );
        this.broadcastPresence();
        return;
      }
      // Task 1: only join is authoritative; moves land in Task 2.
      if (!att.joined || !att.role) {
        ws.close(1008, "join first");
        return;
      }
      ws.send(
        encodeServerFrame({
          t: "reject",
          reason: "moves not yet supported",
          state: this.gameState,
          version: this.version,
        }),
      );
    } catch (err) {
      const code = err instanceof ProtocolError ? err.closeCode : 1003;
      try {
        ws.close(code, "malformed frame");
      } catch {
        // already closed
      }
    }
  }

  override async webSocketClose(ws: WebSocket) {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (att?.role) {
      this.lastSeen.set(att.role, Date.now());
      // 120s reconnect grace: presence is recomputed on next join/broadcast.
      setTimeout(() => {
        this.broadcastPresence();
      }, 0);
    }
    this.broadcastPresence();
  }

  private connectedRoles(): Set<Role> {
    const roles = new Set<Role>();
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att?.joined && att.role) roles.add(att.role);
    }
    return roles;
  }

  private broadcastPresence() {
    const connected = this.connectedRoles();
    void RECONNECT_GRACE_MS; // grace window enforced in Task 2 resync
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
