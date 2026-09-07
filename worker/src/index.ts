import { mintJoinToken } from "./auth";
import type { Role } from "./protocol";

export { GameRoom, type Env } from "./room";

export interface WorkerEnv {
  GAME_ROOM: DurableObjectNamespace;
  GAME_TOKEN_SECRET: string;
  CLERK_JWKS_URL: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/room") {
      if (!env.GAME_TOKEN_SECRET) {
        return json({ error: "server misconfigured" }, 500);
      }
      const gameId = crypto.randomUUID();
      const white = await mintJoinToken(gameId, "white" satisfies Role, env.GAME_TOKEN_SECRET);
      const black = await mintJoinToken(gameId, "black" satisfies Role, env.GAME_TOKEN_SECRET);
      return json({ gameId, tokens: { white, black } });
    }

    const wsMatch = url.pathname.match(/^\/room\/([^/]+)\/ws$/);
    if (wsMatch && request.method === "GET") {
      const gameId = wsMatch[1] as string;
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
