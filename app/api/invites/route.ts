import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invites } from "@/lib/db/schema";
import { sendInviteEmail } from "@/lib/email/send";
import {
  mintInviteRecord,
  normalizeCode,
  redeemCheck,
  type InviteRecord,
  type InviteStore,
} from "@/lib/invites/invites";

// Friend invites: Clerk-only mint (code + gameId UUID, 24h expiry,
// single-use). Host plays white; the redeeming guest plays black.
// Fail-closed: no Clerk session → 401. No E2E bypass by intent.

export interface InviteDeps {
  store: InviteStore;
  clerkAuth: () => Promise<string | null>;
  now?: () => Date;
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

function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: unknown })?.code;
  if (code === "23505") return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /duplicate key|unique constraint|already exists/i.test(msg);
}

export function drizzleInviteStore(database: typeof db): InviteStore {
  return {
    async insert(invite) {
      await database.insert(invites).values({
        code: invite.code,
        hostClerkId: invite.hostClerkId,
        gameId: invite.gameId,
        expiresAt: invite.expiresAt,
      });
    },
    async findByCode(code) {
      const rows = await database
        .select()
        .from(invites)
        .where(eq(invites.code, code));
      const r = rows[0];
      if (!r) return null;
      if (!r.gameId) return null;
      return {
        code: r.code,
        hostClerkId: r.hostClerkId,
        gameId: r.gameId,
        expiresAt: r.expiresAt,
        usedAt: r.usedAt,
      };
    },
    async markUsed(code, now) {
      // Conditional consume: only a fresh, unexpired row flips to used, so
      // two concurrent redeems cannot both succeed and an expiry racing the
      // consume cannot be redeemed (falls through to the 410 path below).
      const rows = await database
        .update(invites)
        .set({ usedAt: now })
        .where(
          and(
            eq(invites.code, code),
            isNull(invites.usedAt),
            gt(invites.expiresAt, now),
          ),
        )
        .returning();
      const r = rows[0];
      if (!r || !r.gameId) return null;
      return {
        code: r.code,
        hostClerkId: r.hostClerkId,
        gameId: r.gameId,
        expiresAt: r.expiresAt,
        usedAt: r.usedAt,
      };
    },
  };
}

/** POST {} → mint { code, gameId, expiresAt }. Clerk-only. */
export async function handleMintInvite(
  req: Request,
  deps: InviteDeps,
  opts?: { email?: unknown; hostName?: unknown },
): Promise<Response> {
  const userId = await deps.clerkAuth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const now = deps.now?.() ?? new Date();
  // Code space (32^8) makes collisions negligible; retry once on PK conflict.
  for (let attempt = 0; attempt < 2; attempt++) {
    const record = mintInviteRecord(userId, now);
    try {
      await deps.store.insert(record);
    } catch (e) {
      if (isUniqueViolation(e) && attempt === 0) continue;
      throw e;
    }
    notifyInvite(req, record, opts);
    return NextResponse.json({
      code: record.code,
      gameId: record.gameId,
      expiresAt: record.expiresAt.toISOString(),
    });
  }
  return NextResponse.json({ error: "try again" }, { status: 503 });
}

function asEmail(v: unknown): string | undefined {
  return typeof v === "string" && v.includes("@") ? v : undefined;
}

function asHostName(v: unknown): string {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : "Your opponent";
}

/** Best-effort invite email: never throws, never blocks the mint response. */
function notifyInvite(req: Request, record: InviteRecord, opts?: { email?: unknown; hostName?: unknown }) {
  const to = asEmail(opts?.email);
  const inviteUrl = `${new URL(req.url).origin}/play/join?code=${record.code}`;
  void sendInviteEmail({
    to,
    hostName: asHostName(opts?.hostName),
    code: record.code,
    inviteUrl,
  });
}

/** Consume one code → { code, gameId }. 404 unknown, 410 expired, 409 used. */
async function redeemCode(
  rawCode: unknown,
  deps: InviteDeps,
): Promise<Response> {
  const userId = await deps.clerkAuth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Normalize "abcd efgh"-style entry before lookup; unparseable → unknown.
  const code =
    typeof rawCode === "string"
      ? normalizeCode(rawCode.replace(/\s+/g, ""))
      : null;
  if (!code) {
    return NextResponse.json({ error: "unknown code" }, { status: 404 });
  }
  const now = deps.now?.() ?? new Date();
  const row: InviteRecord | null = await deps.store.findByCode(code);
  const blocked = redeemCheck(row, now);
  if (blocked) {
    const error =
      blocked.status === 410
        ? "code expired"
        : blocked.status === 409
          ? "code already used"
          : "unknown code";
    return NextResponse.json({ error }, { status: blocked.status });
  }
  const used = await deps.store.markUsed(code, now);
  if (!used) {
    // Lost a race: re-read to distinguish expired (410) from used (409).
    // Covers the expiry racing the conditional consume above.
    const reread: InviteRecord | null = await deps.store.findByCode(code);
    const reblocked = redeemCheck(reread, now);
    if (reblocked?.status === 410) {
      return NextResponse.json({ error: "code expired" }, { status: 410 });
    }
    // Lost a concurrent redeem race: the code is now used.
    return NextResponse.json({ error: "code already used" }, { status: 409 });
  }
  return NextResponse.json({ code: used.code, gameId: used.gameId });
}

/** POST { code } → redeem. POST {} → mint. Clerk-only, fail-closed. */
export async function handleRedeemInvite(
  req: Request,
  deps: InviteDeps,
): Promise<Response> {
  let body: unknown = null;
  try {
    const text = await req.text();
    body = text ? (JSON.parse(text) as unknown) : {};
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  return redeemCode((body as Record<string, unknown> | null)?.code, deps);
}

/** GET read-only lookup → { code, gameId, expiresAt }. Never consumes. */
export async function handleLookupInvite(
  req: Request,
  deps: InviteDeps,
): Promise<Response> {
  const userId = await deps.clerkAuth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const codeParam = new URL(req.url).searchParams.get("code");
  const code =
    typeof codeParam === "string"
      ? normalizeCode(codeParam.replace(/\s+/g, ""))
      : null;
  if (!code) {
    return NextResponse.json({ error: "unknown code" }, { status: 404 });
  }
  const now = deps.now?.() ?? new Date();
  const row: InviteRecord | null = await deps.store.findByCode(code);
  const blocked = redeemCheck(row, now);
  if (blocked) {
    const error =
      blocked.status === 410
        ? "code expired"
        : blocked.status === 409
          ? "code already used"
          : "unknown code";
    return NextResponse.json({ error }, { status: blocked.status });
  }
  return NextResponse.json({
    code: row!.code,
    gameId: row!.gameId,
    expiresAt: row!.expiresAt.toISOString(),
  });
}

export async function POST(req: Request) {
  const deps: InviteDeps = {
    store: drizzleInviteStore(db),
    clerkAuth: clerkUserId,
  };
  let body: unknown = null;
  try {
    const text = await req.text();
    body = text ? (JSON.parse(text) as unknown) : {};
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  // The body stream is consumed above, so re-dispatch on the parsed value
  // instead of re-reading the request.
  const fields = (body as Record<string, unknown> | null) ?? {};
  if (fields.code !== undefined) {
    return redeemCode(fields.code, deps);
  }
  return handleMintInvite(req, deps, {
    email: fields.email,
    hostName: fields.hostName,
  });
}

/** GET ?code= → read-only lookup (never consumes; POST redeems). */
export async function GET(req: Request) {
  const deps: InviteDeps = {
    store: drizzleInviteStore(db),
    clerkAuth: clerkUserId,
  };
  const code = new URL(req.url).searchParams.get("code");
  if (code === null) {
    return NextResponse.json({ error: "code required" }, { status: 400 });
  }
  return handleLookupInvite(req, deps);
}
