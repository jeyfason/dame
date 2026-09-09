// In-test mocked game room (no worker needed).
//
// Stubs GET /api/room (token mint) and emulates the worker WS protocol
// (worker/src/protocol.ts) over routeWebSocket: join -> presence + state,
// move -> authoritative applyMove + version bump + state (+ end on win),
// chat -> echo from the opponent. Prod code is untouched.
import type { Page } from "@playwright/test";
import { applyMove, initialBoard } from "../../lib/rules/international";
import type { GameState } from "../../lib/rules/types";

export async function mockRoom(
  page: Page,
  opts?: { role?: "white" | "black" },
): Promise<void> {
  const role = opts?.role ?? "white";
  let state: GameState = initialBoard();
  let version = 0;

  await page.route(
    (url) => url.pathname === "/api/room",
    async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      const url = new URL(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          gameId: url.searchParams.get("gameId"),
          role: url.searchParams.get("role") ?? role,
          token: "mock-token",
          wsUrl: "ws://localhost:8787",
        }),
      });
    },
  );

  await page.routeWebSocket(
    (url) => url.pathname.endsWith("/ws"),
    (ws) => {
      ws.onMessage((raw) => {
        let frame: Record<string, unknown>;
        try {
          const text =
            typeof raw === "string" ? raw : Buffer.from(raw as Uint8Array).toString("utf8");
          frame = JSON.parse(text) as Record<string, unknown>;
        } catch {
          return;
        }
        if (frame.t === "join") {
          ws.send(
            JSON.stringify({ t: "presence", you: role, opponentConnected: true }),
          );
          ws.send(JSON.stringify({ t: "state", state, version }));
          return;
        }
        if (frame.t === "move") {
          try {
            state = applyMove(state, frame.move as Parameters<typeof applyMove>[1]);
            version += 1;
          } catch {
            ws.send(JSON.stringify({ t: "reject", reason: "Illegal move", state, version }));
            return;
          }
          ws.send(JSON.stringify({ t: "state", state, version }));
          if (state.winner) {
            ws.send(JSON.stringify({ t: "end", winner: state.winner, reason: "win" }));
          }
        }
      });
    },
  );
}
