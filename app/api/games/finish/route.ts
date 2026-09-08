import { NextResponse } from "next/server";

// Stage 4 will persist results + update ratings. This stub only logs
// (worker calls it on game end) and returns 200 so the realtime path
// can ship without DB writes.
export async function POST(req: Request) {
  let body: unknown = null;
  try {
    const text = await req.text();
    body = text ? (JSON.parse(text) as unknown) : {};
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  console.log("[games/finish] stub", {
    gameId: typeof b.gameId === "string" ? b.gameId : null,
    winner:
      b.winner === "white" || b.winner === "black" || b.winner === null
        ? b.winner
        : "unknown",
    reason: typeof b.reason === "string" ? b.reason : null,
  });
  return NextResponse.json({ ok: true });
}
