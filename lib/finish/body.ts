// Shared worker->route finish body: the exact JSON the GameRoom
// broadcastEnd POSTs to /api/games/finish. Lives in lib (not worker/src)
// so both the worker (../../lib/...) and root tests (@/lib/...) can import
// it without dragging cloudflare:workers into the root tsc program.

export interface FinishBodyInput {
  gameId: string;
  whiteClerkId: string;
  blackClerkId: string;
  winner: "white" | "black" | "draw" | null;
  reason: string;
  moves: unknown[];
}

/**
 * Allowlisted to the fields the Next finish route parses
 * (gameId/whiteClerkId/blackClerkId/winner/reason/moves). Internal `version`
 * is deliberately excluded — the route drops unknown fields, but keeping
 * the body exact keeps the contract test honest.
 */
export function buildFinishBody(input: FinishBodyInput): string {
  return JSON.stringify({
    gameId: input.gameId,
    whiteClerkId: input.whiteClerkId,
    blackClerkId: input.blackClerkId,
    winner: input.winner,
    reason: input.reason,
    moves: input.moves,
  });
}
