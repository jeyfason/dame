import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { games, ratings, ratingHistory } from "@/lib/db/schema";
import { sendResultEmail } from "@/lib/email/send";
import {
  persistFinishedGame,
  type FinishStore,
  type FinishWinner,
  type GameInput,
} from "@/lib/ratings/update";
import {
  DEFAULT_RATING,
  DEFAULT_RD,
  DEFAULT_VOL,
} from "@/lib/ratings/glicko2";

// Rated finish: worker-HMAC-or-Clerk auth (fail-closed), validated body,
// idempotent persist on gameId (retries safe), Glicko-2 deltas returned.
//
// NOTE: @neondatabase/serverless HTTP has no multi-statement transactions,
// so persist is sequential statements with PK-conflict idempotency: a
// duplicate gameId insert (SQLSTATE 23505) is treated as a retry, never an
// error. A crash between statements can leave a game without rating rows;
// the duplicate path then recomputes applyGameResult from current ratings
// and persists (history writes are idempotent via the unique game+clerk
// index) instead of reporting a false zero-delta success.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WINNERS: ReadonlySet<unknown> = new Set(["white", "black", "draw", null]);

function isClerkId(v: unknown): v is string {
  return typeof v === "string" && v.length >= 1 && v.length <= 128;
}

function signaturesEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length || ab.length === 0) return false;
  return timingSafeEqual(ab, bb);
}

/** Worker HMAC: hex(HMAC-SHA256(GAME_TOKEN_SECRET, rawBody)) in x-worker-signature. */
export function verifyWorkerSignature(
  rawBody: string,
  signature: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return signaturesEqual(signature.trim().toLowerCase(), expected);
}

async function clerkUserId(): Promise<string | null> {
  try {
    const { isAuthenticated, userId } = await auth();
    if (!isAuthenticated || !userId) return null;
    return userId;
  } catch {
    // Fail closed: any auth error means unauthenticated.
    return null;
  }
}

export interface FinishDeps {
  store: FinishStore;
  clerkAuth: () => Promise<string | null>;
}

function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: unknown })?.code;
  if (code === "23505") return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /duplicate key|unique constraint|already exists/i.test(msg);
}

export function drizzleStore(database: typeof db): FinishStore {
  return {
    async findGame(gameId) {
      const rows = await database
        .select()
        .from(games)
        .where(eq(games.id, gameId));
      const g = rows[0];
      if (!g) return null;
      return {
        gameId: g.id,
        whiteClerkId: g.whiteClerkId,
        blackClerkId: g.blackClerkId,
        winner: (g.winner ?? null) as FinishWinner,
        reason: g.reason,
        moves: Array.isArray(g.moves) ? g.moves : [],
        finishedAt: g.finishedAt,
      };
    },
    async insertGame(g) {
      try {
        await database.insert(games).values({
          id: g.gameId,
          whiteClerkId: g.whiteClerkId,
          blackClerkId: g.blackClerkId,
          winner: g.winner,
          reason: g.reason,
          moves: g.moves,
        });
        return true;
      } catch (e) {
        // Idempotent retry: same gameId already persisted.
        if (isUniqueViolation(e)) return false;
        throw e;
      }
    },
    async getRating(clerkId) {
      const rows = await database
        .select()
        .from(ratings)
        .where(eq(ratings.clerkId, clerkId));
      const r = rows[0];
      if (!r) {
        return {
          rating: DEFAULT_RATING,
          rd: DEFAULT_RD,
          vol: DEFAULT_VOL,
          gamesPlayed: 0,
        };
      }
      return {
        rating: r.rating,
        rd: r.rd,
        vol: r.vol,
        gamesPlayed: r.gamesPlayed,
      };
    },
    async saveRating(clerkId, r) {
      await database
        .insert(ratings)
        .values({
          clerkId,
          rating: r.rating,
          rd: r.rd,
          vol: r.vol,
          gamesPlayed: r.gamesPlayed,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: ratings.clerkId,
          set: {
            rating: r.rating,
            rd: r.rd,
            vol: r.vol,
            gamesPlayed: r.gamesPlayed,
            updatedAt: new Date(),
          },
        });
    },
    async addHistory(row) {
      // Idempotent: crash recovery and retried duplicates re-issue the same
      // (game, player) row; the unique index turns replays into no-ops.
      await database
        .insert(ratingHistory)
        .values({
          clerkId: row.clerkId,
          gameId: row.gameId,
          rating: row.rating,
          rd: row.rd,
        })
        .onConflictDoNothing({
          target: [ratingHistory.gameId, ratingHistory.clerkId],
        });
    },
    async historyForGame(gameId) {
      const rows = await database
        .select()
        .from(ratingHistory)
        .where(eq(ratingHistory.gameId, gameId));
      return rows.map((r) => ({
        clerkId: r.clerkId,
        gameId: r.gameId,
        rating: r.rating,
        rd: r.rd,
      }));
    },
  };
}

// Body is allowlisted: only the GameInput fields below are read. Unknown
// fields (e.g. the worker's legacy internal `version`) are dropped, never
// rejected — the worker->route contract test locks the exact worker body.
/** Exported for the worker->route contract test (broadcastEnd body must parse). */
export function parseFinishBody(body: unknown):
  | { ok: true; input: GameInput }
  | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.gameId !== "string" || !UUID_RE.test(b.gameId)) {
    return { ok: false, error: "gameId must be a UUID" };
  }
  if (!isClerkId(b.whiteClerkId) || !isClerkId(b.blackClerkId)) {
    return { ok: false, error: "whiteClerkId and blackClerkId required" };
  }
  if (b.whiteClerkId === b.blackClerkId) {
    return { ok: false, error: "whiteClerkId and blackClerkId must differ" };
  }
  if (!("winner" in b) || !WINNERS.has(b.winner)) {
    return { ok: false, error: "winner must be white|black|draw|null" };
  }
  if (b.reason !== undefined && b.reason !== null) {
    if (typeof b.reason !== "string" || b.reason.length > 256) {
      return { ok: false, error: "reason must be a short string or null" };
    }
  }
  if (b.moves !== undefined && !Array.isArray(b.moves)) {
    return { ok: false, error: "moves must be an array" };
  }
  return {
    ok: true,
    input: {
      gameId: b.gameId,
      whiteClerkId: b.whiteClerkId,
      blackClerkId: b.blackClerkId,
      winner: b.winner as FinishWinner,
      reason:
        typeof b.reason === "string" ? b.reason : null,
      moves: Array.isArray(b.moves) ? b.moves : [],
    },
  };
}

export async function handleFinish(
  req: Request,
  deps: FinishDeps,
): Promise<Response> {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  let body: unknown = {};
  try {
    body = raw ? (JSON.parse(raw) as unknown) : {};
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  // Auth: worker HMAC first, else Clerk session. Anything else → 401.
  // Clerk callers must also be a participant (white/black) → else 403.
  const workerAuthed = verifyWorkerSignature(
    raw,
    req.headers.get("x-worker-signature"),
    process.env.GAME_TOKEN_SECRET,
  );
  let clerkUserId: string | null = null;
  if (!workerAuthed) {
    clerkUserId = await deps.clerkAuth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const parsed = parseFinishBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  if (!workerAuthed) {
    if (
      clerkUserId !== parsed.input.whiteClerkId &&
      clerkUserId !== parsed.input.blackClerkId
    ) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const result = await persistFinishedGame(deps.store, parsed.input);
  // Best-effort result email (never throws, never blocks the response).
  // Recipient addresses are optional caller-supplied fields; duplicates
  // (retries) never resend.
  if (!result.duplicate) {
    const fields = (body ?? {}) as Record<string, unknown>;
    const origin = new URL(req.url).origin;
    const rematchUrl = `${origin}/play/join`;
    for (const to of [fields.whiteEmail, fields.blackEmail]) {
      if (typeof to === "string" && to.includes("@")) {
        void sendResultEmail({
          to,
          gameId: result.game.gameId,
          winner: result.game.winner,
          whiteName: parsed.input.whiteClerkId,
          blackName: parsed.input.blackClerkId,
          whiteDelta: result.white.after.rating - result.white.before.rating,
          blackDelta: result.black.after.rating - result.black.before.rating,
          rematchUrl,
        });
      }
    }
  }
  return NextResponse.json({
    ok: true,
    gameId: result.game.gameId,
    winner: result.game.winner,
    duplicate: result.duplicate,
    white: result.white,
    black: result.black,
  });
}

export async function POST(req: Request) {
  return handleFinish(req, { store: drizzleStore(db), clerkAuth: clerkUserId });
}
