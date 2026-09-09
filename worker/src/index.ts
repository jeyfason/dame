import { mintJoinToken, verifyClerkToken } from "./auth";
import type { Role } from "./protocol";

export { GameRoom, type Env } from "./room";

export interface WorkerEnv {
  GAME_ROOM: DurableObjectNamespace;
  GAME_TOKEN_SECRET: string;
  CLERK_JWKS_URL: string;
  /** Dev/test-only open mint. Never set in production (fail closed). */
  E2E_BYPASS_AUTH?: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Game identity: gameId is a UUIDv4 (crypto.randomUUID). Creation mints one
// below; member-join (WS path + Next /api/room) requires one, matching the
// finish route's uuid validation and the DB uuid PKs.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const worker = {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/room") {
      // Clerk session required to close the open-mint gap. Dev/test-only
      // bypass via E2E_BYPASS_AUTH=1 (mirrors Next middleware); production
      // stays fail-closed — no bypass unless the var is explicitly set.
      if (env.E2E_BYPASS_AUTH !== "1") {
        if (!env.CLERK_JWKS_URL) {
          return json({ error: "server misconfigured" }, 500);
        }
        const auth = request.headers.get("Authorization");
        const token =
          auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
        if (!token) {
          return json({ error: "unauthorized" }, 401);
        }
        try {
          await verifyClerkToken(token, env.CLERK_JWKS_URL);
        } catch {
          return json({ error: "unauthorized" }, 401);
        }
      }
      if (!env.GAME_TOKEN_SECRET) {
        return json({ error: "server misconfigured" }, 500);
      }
      const gameId = crypto.randomUUID();
      // Pair minted without sub (only the requester is authenticated; the
      // opponent is unknown). Players bind identity via Next /api/room
      // per-role tokens; the room records role->clerkId at WS join.
      const white = await mintJoinToken(gameId, "white" satisfies Role, env.GAME_TOKEN_SECRET);
      const black = await mintJoinToken(gameId, "black" satisfies Role, env.GAME_TOKEN_SECRET);
      return json({ gameId, tokens: { white, black } });
    }

    const wsMatch = url.pathname.match(/^\/room\/([^/]+)\/ws$/);
    if (wsMatch && request.method === "GET") {
      const gameId = wsMatch[1] as string;
      let id = "";
      try {
        id = decodeURIComponent(gameId);
      } catch {
        return json({ error: "gameId must be a UUID" }, 400);
      }
      if (!UUID_RE.test(id)) {
        return json({ error: "gameId must be a UUID" }, 400);
      }
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      const stub = env.GAME_ROOM.getByName(gameId);
      return stub.fetch(request);
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true });
    }

    return json({ error: "not found" }, 404);
  },
};

export default worker;
