import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

type Role = "white" | "black";

function isE2EBypass(): boolean {
  return (
    process.env.E2E_BYPASS_AUTH === "1" && process.env.NODE_ENV !== "production"
  );
}

async function requireUserId(): Promise<string | null> {
  if (isE2EBypass()) return "e2e-test-user";
  try {
    const { isAuthenticated, userId } = await auth();
    if (!isAuthenticated || !userId) return null;
    return userId;
  } catch {
    // Fail closed: any auth error means unauthenticated.
    return null;
  }
}

function getSecret(): string | null {
  const s = process.env.GAME_TOKEN_SECRET;
  if (!s) return null;
  return s;
}

function wsPublicUrl(): string {
  return process.env.NEXT_PUBLIC_ROOM_WS_URL ?? "ws://localhost:8787";
}

function isValidRole(v: unknown): v is Role {
  return v === "white" || v === "black";
}

function isValidGameId(v: unknown): v is string {
  return (
    typeof v === "string" &&
    v.length >= 1 &&
    v.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(v)
  );
}

export async function mintJoinToken(
  gameId: string,
  role: Role,
  secret: string,
  ttlSec = 3600,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payloadJson = JSON.stringify({ gameId, role, exp });
  const payload = Buffer.from(payloadJson, "utf8").toString("base64url");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)),
  );
  const sig = Buffer.from(sigBytes).toString("base64url");
  return `${payload}.${sig}`;
}

// GET /api/room?gameId=<id>&role=white|black -> single join token.
// Clerk session required (fail-closed); E2E bypass only outside production.
export async function GET(req: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const secret = getSecret();
  if (!secret) {
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
  const url = new URL(req.url);
  const gameId = url.searchParams.get("gameId");
  const role = url.searchParams.get("role");
  if (!isValidGameId(gameId) || !isValidRole(role)) {
    return NextResponse.json(
      { error: "gameId and role=white|black required" },
      { status: 400 },
    );
  }
  const token = await mintJoinToken(gameId, role, secret);
  return NextResponse.json({ gameId, role, token, wsUrl: wsPublicUrl() });
}

// POST /api/room { gameId?, role? } ->
//   gameId+role: single token { gameId, role, token, wsUrl }
//   otherwise: new game { gameId, tokens: { white, black }, wsUrl }
export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const secret = getSecret();
  if (!secret) {
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
  let body: unknown = null;
  try {
    const text = await req.text();
    body = text ? (JSON.parse(text) as unknown) : {};
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  if (isValidGameId(b.gameId) && isValidRole(b.role)) {
    const token = await mintJoinToken(b.gameId, b.role, secret);
    return NextResponse.json({
      gameId: b.gameId,
      role: b.role,
      token,
      wsUrl: wsPublicUrl(),
    });
  }
  if (b.gameId !== undefined || b.role !== undefined) {
    return NextResponse.json(
      { error: "gameId and role=white|black required together" },
      { status: 400 },
    );
  }
  const gameId = crypto.randomUUID();
  const [white, black] = await Promise.all([
    mintJoinToken(gameId, "white", secret),
    mintJoinToken(gameId, "black", secret),
  ]);
  return NextResponse.json({ gameId, tokens: { white, black }, wsUrl: wsPublicUrl() });
}
