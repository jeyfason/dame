// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import {
  handleFriendAction,
  handleListFriends,
  type FriendDeps,
  type FriendshipRecord,
  type FriendStore,
  type PresenceStore,
} from "./route";
import * as schema from "@/lib/db/schema";

/** In-memory FriendStore: no live DB required. */
class MemoryFriends implements FriendStore {
  rows = new Map<string, FriendshipRecord>();
  key(a: string, b: string) {
    return `${a}→${b}`;
  }
  async findBetween(a: string, b: string) {
    return (
      this.rows.get(this.key(a, b)) ?? this.rows.get(this.key(b, a)) ?? null
    );
  }
  async findDirected(requester: string, addressee: string) {
    return this.rows.get(this.key(requester, addressee)) ?? null;
  }
  async insert(row: FriendshipRecord) {
    if (await this.findBetween(row.requesterClerkId, row.addresseeClerkId)) {
      const e = new Error("duplicate key value violates unique constraint");
      (e as { code?: string }).code = "23505";
      throw e;
    }
    this.rows.set(
      this.key(row.requesterClerkId, row.addresseeClerkId),
      { ...row },
    );
  }
  async updateStatus(requester: string, addressee: string, status: FriendshipRecord["status"], now: Date) {
    const r = this.rows.get(this.key(requester, addressee));
    if (!r) return null;
    const next = { ...r, status, updatedAt: now };
    this.rows.set(this.key(requester, addressee), next);
    return next;
  }
  async deleteBetween(a: string, b: string) {
    const k1 = this.key(a, b);
    const k2 = this.key(b, a);
    if (this.rows.has(k1)) {
      this.rows.delete(k1);
      return true;
    }
    if (this.rows.has(k2)) {
      this.rows.delete(k2);
      return true;
    }
    return false;
  }
  async listFor(userId: string) {
    return [...this.rows.values()].filter(
      (r) => r.requesterClerkId === userId || r.addresseeClerkId === userId,
    );
  }
}

class MemoryPresence implements PresenceStore {
  seen = new Map<string, Date>();
  async getLastSeen(ids: string[]) {
    const out = new Map<string, Date>();
    for (const id of ids) {
      const v = this.seen.get(id);
      if (v) out.set(id, v);
    }
    return out;
  }
}

const NOW = new Date("2026-09-09T12:00:00Z");

function deps(
  store: FriendStore,
  presence: PresenceStore,
  userId: string | null,
): FriendDeps {
  return { store, presence, clerkAuth: async () => userId, now: () => NOW };
}

function actionReq(action: unknown, userId: unknown): Request {
  return new Request("http://localhost/api/friends", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, userId }),
  });
}

function listReq(): Request {
  return new Request("http://localhost/api/friends", { method: "GET" });
}

let store: MemoryFriends;
let presence: MemoryPresence;

beforeEach(() => {
  store = new MemoryFriends();
  presence = new MemoryPresence();
});

describe("friends schema (Stage 5 Task 2 RED)", () => {
  it("exports friendships + presence tables", () => {
    const s = schema as Record<string, unknown>;
    expect(s["friendships"]).toBeDefined();
    expect(s["presence"]).toBeDefined();
  });
});

describe("api/friends actions", () => {
  it("request creates pending", async () => {
    const res = await handleFriendAction(actionReq("request", "user_b"), deps(store, presence, "user_a"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, status: "pending" });
  });

  it("double-request 409", async () => {
    const d = deps(store, presence, "user_a");
    expect((await handleFriendAction(actionReq("request", "user_b"), d)).status).toBe(200);
    const second = await handleFriendAction(actionReq("request", "user_b"), d);
    expect(second.status).toBe(409);
  });

  it("reverse double-request 409", async () => {
    expect((await handleFriendAction(actionReq("request", "user_b"), deps(store, presence, "user_a"))).status).toBe(200);
    const reverse = await handleFriendAction(actionReq("request", "user_a"), deps(store, presence, "user_b"));
    expect(reverse.status).toBe(409);
  });

  it("opposite-direction race (insert 23505) 409, not 500", async () => {
    // Two concurrent requests (A→B + B→A) can both pass the findBetween
    // pre-check; the unordered DB index (0005) then rejects the loser with
    // 23505, which the route maps to 409. Simulate by hiding the row from
    // the pre-check but throwing on insert.
    const racy: FriendStore = {
      findBetween: async () => null,
      findDirected: (r, a) => store.findDirected(r, a),
      insert: async () => {
        const e = new Error('duplicate key value violates unique constraint "friendships_unordered_uniq"');
        (e as { code?: string }).code = "23505";
        throw e;
      },
      updateStatus: (r, a, s, n) => store.updateStatus(r, a, s, n),
      deleteBetween: (a, b) => store.deleteBetween(a, b),
      listFor: (u) => store.listFor(u),
    };
    const res = await handleFriendAction(actionReq("request", "user_b"), deps(racy, presence, "user_a"));
    expect(res.status).toBe(409);
  });

  it("accept flips pending to accepted", async () => {
    await handleFriendAction(actionReq("request", "user_b"), deps(store, presence, "user_a"));
    const res = await handleFriendAction(actionReq("accept", "user_a"), deps(store, presence, "user_b"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, status: "accepted" });
  });

  it("stranger accept/decline/remove 403", async () => {
    expect((await handleFriendAction(actionReq("accept", "user_stranger"), deps(store, presence, "user_a"))).status).toBe(403);
    expect((await handleFriendAction(actionReq("decline", "user_stranger"), deps(store, presence, "user_a"))).status).toBe(403);
    expect((await handleFriendAction(actionReq("remove", "user_stranger"), deps(store, presence, "user_a"))).status).toBe(403);
  });

  it("decline resolves pending", async () => {
    await handleFriendAction(actionReq("request", "user_b"), deps(store, presence, "user_a"));
    const res = await handleFriendAction(actionReq("decline", "user_a"), deps(store, presence, "user_b"));
    expect(res.status).toBe(200);
  });

  it("remove deletes accepted friendship", async () => {
    await handleFriendAction(actionReq("request", "user_b"), deps(store, presence, "user_a"));
    await handleFriendAction(actionReq("accept", "user_a"), deps(store, presence, "user_b"));
    const res = await handleFriendAction(actionReq("remove", "user_b"), deps(store, presence, "user_a"));
    expect(res.status).toBe(200);
    // After remove, a fresh request is allowed again.
    const again = await handleFriendAction(actionReq("request", "user_b"), deps(store, presence, "user_a"));
    expect(again.status).toBe(200);
  });

  it("fails closed 401 when unauthenticated", async () => {
    expect((await handleFriendAction(actionReq("request", "user_b"), deps(store, presence, null))).status).toBe(401);
    expect((await handleListFriends(listReq(), deps(store, presence, null))).status).toBe(401);
  });
});

describe("api/friends list + online flag", () => {
  it("GET lists friends with online <5min", async () => {
    await handleFriendAction(actionReq("request", "user_b"), deps(store, presence, "user_a"));
    await handleFriendAction(actionReq("accept", "user_a"), deps(store, presence, "user_b"));
    await handleFriendAction(actionReq("request", "user_c"), deps(store, presence, "user_a"));
    await handleFriendAction(actionReq("accept", "user_a"), deps(store, presence, "user_c"));
    // user_b seen 1min ago → online; user_c seen 10min ago → offline.
    presence.seen.set("user_b", new Date(NOW.getTime() - 60_000));
    presence.seen.set("user_c", new Date(NOW.getTime() - 10 * 60_1000));

    const res = await handleListFriends(listReq(), deps(store, presence, "user_a"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      friends: { userId: string; online: boolean }[];
    };
    const byId = new Map(json.friends.map((f) => [f.userId, f.online]));
    expect(byId.get("user_b")).toBe(true);
    expect(byId.get("user_c")).toBe(false);
  });
});
