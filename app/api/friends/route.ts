import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { friendships, presence as presenceTable } from "@/lib/db/schema";
import { isOnline } from "@/lib/presence/presence";
import {
  isClerkId,
  otherParty,
  type FriendshipStatus,
} from "@/lib/friends/friends";

// Friends: Clerk-only request/accept/decline/remove + GET list with online.
// Fail-closed: no Clerk session → 401. Strangers acting on a non-existent
// relation → 403. Duplicate pending/accepted pairs → 409.

// Re-exported for tests (in-memory stores implement these, no live DB).
export interface FriendshipRecord {
  requesterClerkId: string;
  addresseeClerkId: string;
  status: FriendshipStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface FriendStore {
  findBetween(a: string, b: string): Promise<FriendshipRecord | null>;
  findDirected(
    requester: string,
    addressee: string,
  ): Promise<FriendshipRecord | null>;
  insert(row: FriendshipRecord): Promise<void>;
  updateStatus(
    requester: string,
    addressee: string,
    status: FriendshipStatus,
    now: Date,
  ): Promise<FriendshipRecord | null>;
  deleteBetween(a: string, b: string): Promise<boolean>;
  listFor(userId: string): Promise<FriendshipRecord[]>;
}

/** Narrow presence view: the list only needs last-seen reads. */
export interface PresenceStore {
  getLastSeen(clerkIds: string[]): Promise<Map<string, Date>>;
}

export interface FriendDeps {
  store: FriendStore;
  presence: PresenceStore;
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

const ACTIONS = new Set(["request", "accept", "decline", "remove"]);

/** POST { action: request|accept|decline|remove, userId } → 200 | 400 | 401 | 403 | 409. */
export async function handleFriendAction(
  req: Request,
  deps: FriendDeps,
): Promise<Response> {
  const me = await deps.clerkAuth();
  if (!me) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: unknown = null;
  try {
    const text = await req.text();
    body = text ? (JSON.parse(text) as unknown) : {};
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const action = b.action;
  const target = b.userId;
  if (typeof action !== "string" || !ACTIONS.has(action)) {
    return NextResponse.json({ error: "action must be request|accept|decline|remove" }, { status: 400 });
  }
  if (!isClerkId(target)) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }
  if (target === me) {
    return NextResponse.json({ error: "cannot friend yourself" }, { status: 400 });
  }
  const now = deps.now?.() ?? new Date();

  if (action === "request") {
    const existing = await deps.store.findBetween(me, target);
    if (existing && existing.status !== "declined") {
      return NextResponse.json(
        { error: "already requested or friends" },
        { status: 409 },
      );
    }
    if (existing && existing.status === "declined") {
      // A declined thread does not block a fresh request.
      await deps.store.deleteBetween(me, target);
    }
    try {
      await deps.store.insert({
        requesterClerkId: me,
        addresseeClerkId: target,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });
    } catch (e) {
      // Lost a race with a concurrent request → duplicate, not an error.
      if (isUniqueViolation(e)) {
        return NextResponse.json(
          { error: "already requested or friends" },
          { status: 409 },
        );
      }
      throw e;
    }
    return NextResponse.json({ ok: true, status: "pending" });
  }

  if (action === "accept" || action === "decline") {
    // Only the addressee of a pending request may resolve it; anything
    // else (unknown user, wrong direction, already resolved) is a
    // stranger action → 403, never a 404 leak.
    const pending = await deps.store.findDirected(target, me);
    if (!pending || pending.status !== "pending") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const next: FriendshipStatus = action === "accept" ? "accepted" : "declined";
    await deps.store.updateStatus(target, me, next, now);
    return NextResponse.json({ ok: true, status: next });
  }

  // action === "remove": only an accepted friendship can be removed.
  const existing = await deps.store.findBetween(me, target);
  if (!existing || existing.status !== "accepted") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await deps.store.deleteBetween(me, target);
  return NextResponse.json({ ok: true, removed: true });
}

/** GET → { friends: [{ userId, online }], incoming, outgoing }. Clerk-only. */
export async function handleListFriends(
  _req: Request,
  deps: FriendDeps,
): Promise<Response> {
  const me = await deps.clerkAuth();
  if (!me) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const now = deps.now?.() ?? new Date();
  const rows = await deps.store.listFor(me);
  const friendIds: string[] = [];
  const incoming: string[] = [];
  const outgoing: string[] = [];
  for (const r of rows) {
    if (r.status === "accepted") {
      friendIds.push(otherParty(r, me));
    } else if (r.status === "pending") {
      if (r.addresseeClerkId === me) incoming.push(r.requesterClerkId);
      else outgoing.push(r.addresseeClerkId);
    }
  }
  // Presence is best-effort: a failing lookup degrades to all-offline,
  // never a 500 for the friends list.
  let seen = new Map<string, Date>();
  try {
    seen = await deps.presence.getLastSeen(friendIds);
  } catch {
    seen = new Map<string, Date>();
  }
  return NextResponse.json({
    friends: friendIds.map((userId) => ({
      userId,
      online: isOnline(seen.get(userId), now),
    })),
    incoming: incoming.map((userId) => ({ userId })),
    outgoing: outgoing.map((userId) => ({ userId })),
  });
}

export function drizzleFriendStore(database: typeof db): FriendStore {
  return {
    async findBetween(a, b) {
      const rows = await database
        .select()
        .from(friendships)
        .where(
          or(
            and(
              eq(friendships.requesterClerkId, a),
              eq(friendships.addresseeClerkId, b),
            ),
            and(
              eq(friendships.requesterClerkId, b),
              eq(friendships.addresseeClerkId, a),
            ),
          ),
        )
        .limit(1);
      const r = rows[0];
      if (!r) return null;
      return {
        requesterClerkId: r.requesterClerkId,
        addresseeClerkId: r.addresseeClerkId,
        status: r.status as FriendshipStatus,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    },
    async findDirected(requester, addressee) {
      const rows = await database
        .select()
        .from(friendships)
        .where(
          and(
            eq(friendships.requesterClerkId, requester),
            eq(friendships.addresseeClerkId, addressee),
          ),
        )
        .limit(1);
      const r = rows[0];
      if (!r) return null;
      return {
        requesterClerkId: r.requesterClerkId,
        addresseeClerkId: r.addresseeClerkId,
        status: r.status as FriendshipStatus,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    },
    async insert(row) {
      await database.insert(friendships).values({
        requesterClerkId: row.requesterClerkId,
        addresseeClerkId: row.addresseeClerkId,
        status: row.status,
      });
    },
    async updateStatus(requester, addressee, status, now) {
      const rows = await database
        .update(friendships)
        .set({ status, updatedAt: now })
        .where(
          and(
            eq(friendships.requesterClerkId, requester),
            eq(friendships.addresseeClerkId, addressee),
          ),
        )
        .returning();
      const r = rows[0];
      if (!r) return null;
      return {
        requesterClerkId: r.requesterClerkId,
        addresseeClerkId: r.addresseeClerkId,
        status: r.status as FriendshipStatus,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    },
    async deleteBetween(a, b) {
      const direct = await database
        .delete(friendships)
        .where(
          and(
            eq(friendships.requesterClerkId, a),
            eq(friendships.addresseeClerkId, b),
          ),
        )
        .returning({ id: friendships.id });
      if (direct.length > 0) return true;
      const reverse = await database
        .delete(friendships)
        .where(
          and(
            eq(friendships.requesterClerkId, b),
            eq(friendships.addresseeClerkId, a),
          ),
        )
        .returning({ id: friendships.id });
      return reverse.length > 0;
    },
    async listFor(userId) {
      const rows = await database
        .select()
        .from(friendships)
        .where(
          or(
            eq(friendships.requesterClerkId, userId),
            eq(friendships.addresseeClerkId, userId),
          ),
        )
        .limit(1000);
      return rows.map((r) => ({
        requesterClerkId: r.requesterClerkId,
        addresseeClerkId: r.addresseeClerkId,
        status: r.status as FriendshipStatus,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    },
  };
}

export function drizzlePresenceStore(database: typeof db): PresenceStore {
  return {
    async getLastSeen(clerkIds) {
      const out = new Map<string, Date>();
      if (clerkIds.length === 0) return out;
      const { inArray } = await import("drizzle-orm");
      const rows = await database
        .select()
        .from(presenceTable)
        .where(inArray(presenceTable.clerkId, clerkIds));
      for (const r of rows) out.set(r.clerkId, r.lastSeen);
      return out;
    },
  };
}

export async function POST(req: Request) {
  return handleFriendAction(req, {
    store: drizzleFriendStore(db),
    presence: drizzlePresenceStore(db),
    clerkAuth: clerkUserId,
  });
}

export async function GET(req: Request) {
  return handleListFriends(req, {
    store: drizzleFriendStore(db),
    presence: drizzlePresenceStore(db),
    clerkAuth: clerkUserId,
  });
}
