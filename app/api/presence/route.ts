import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { presence } from "@/lib/db/schema";

// Presence heartbeat: POST → upsert last_seen=now for the Clerk user.
// Called best-effort by the game client on room join + move (and by the
// room route on token mint). Fail-closed on auth (401); a DB failure
// surfaces as 500 so the client retries on the next heartbeat.

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
  await deps.touch(me, now);
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
