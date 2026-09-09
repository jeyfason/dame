import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { presence } from "@/lib/db/schema";

// Presence heartbeat: POST → upsert last_seen=now for the Clerk user.
// Called best-effort by the game client on room join + move (and by the
// room route on token mint). Fail-closed on auth (401); a DB failure never
// 500s — it returns 200 ok:true with a breadcrumb so the client treats the
// beat as fire-and-forget and retries on the next join/move.

export interface HeartbeatDeps {
  touch: (clerkId: string, now: Date) => Promise<void>;
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

export async function handleHeartbeat(
  _req: Request,
  deps: HeartbeatDeps,
): Promise<Response> {
  const me = await deps.clerkAuth();
  if (!me) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const now = deps.now?.() ?? new Date();
  try {
    await deps.touch(me, now);
  } catch (e) {
    // Best-effort only: a presence outage must never break play. Breadcrumb
    // for observability, still 200 so the client stays silent.
    try {
      Sentry.addBreadcrumb({
        category: "presence",
        level: "warning",
        message: "presence touch failed",
        data: { error: e instanceof Error ? e.message : String(e) },
      });
    } catch {
      // Breadcrumbs must never break the heartbeat path.
    }
  }
  return NextResponse.json({ ok: true, lastSeen: now.toISOString() });
}

export async function POST(req: Request) {
  return handleHeartbeat(req, {
    touch: async (clerkId, now) => {
      await db
        .insert(presence)
        .values({ clerkId, lastSeen: now })
        .onConflictDoUpdate({
          target: presence.clerkId,
          set: { lastSeen: now },
        });
    },
    clerkAuth: clerkUserId,
  });
}
