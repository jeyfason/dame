import { describe, it, expect } from "vitest";
import { handleMintInvite, handleRedeemInvite } from "./route";
import type {
  InviteRecord,
  InviteStore,
} from "@/lib/invites/invites";

/** In-memory InviteStore: no live DB required. */
class MemoryInvites implements InviteStore {
  rows = new Map<string, InviteRecord>();

  async insert(invite: InviteRecord): Promise<void> {
    this.rows.set(invite.code, { ...invite });
  }
  async findByCode(code: string): Promise<InviteRecord | null> {
    return this.rows.get(code) ?? null;
  }
  async markUsed(code: string, now: Date): Promise<InviteRecord | null> {
    const row = this.rows.get(code);
    if (!row || row.usedAt) return null;
    const next = { ...row, usedAt: now };
    this.rows.set(code, next);
    return next;
  }
}

const authed = (userId: string | null) => ({
  clerkAuth: async () => userId,
});

function mintReq(): Request {
  return new Request("http://localhost/api/invites", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

function redeemReq(code: unknown): Request {
  return new Request("http://localhost/api/invites", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

describe("api/invites", () => {
  it("mints code + gameId UUID with 24h expiry (Clerk-only)", async () => {
    const store = new MemoryInvites();
    const res = await handleMintInvite(mintReq(), {
      store,
      ...authed("user_host"),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      code: string;
      gameId: string;
      expiresAt: string;
    };
    expect(json.code).toMatch(/^[A-Z2-9]{8}$/);
    expect(json.gameId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    const expiresMs =
      new Date(json.expiresAt).getTime() - Date.now();
    expect(expiresMs).toBeGreaterThan(23 * 3600 * 1000);
    expect(expiresMs).toBeLessThanOrEqual(24 * 3600 * 1000 + 60_000);
    expect(store.rows.size).toBe(1);
  });

  it("redeems a fresh code (ok)", async () => {
    const store = new MemoryInvites();
    const minted = await handleMintInvite(mintReq(), {
      store,
      ...authed("user_host"),
    });
    const { code, gameId } = (await minted.json()) as {
      code: string;
      gameId: string;
    };
    const res = await handleRedeemInvite(redeemReq(code), {
      store,
      ...authed("user_guest"),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { gameId: string };
    expect(json.gameId).toBe(gameId);
    expect(store.rows.get(code)?.usedAt).toBeInstanceOf(Date);
  });

  it("rejects expired codes with 410", async () => {
    const store = new MemoryInvites();
    const past = new Date(Date.now() - 1000);
    await store.insert({
      code: "ABCDEFGH",
      hostClerkId: "user_host",
      gameId: "123e4567-e89b-12d3-a456-426614174000",
      expiresAt: past,
      usedAt: null,
    });
    const res = await handleRedeemInvite(redeemReq("ABCDEFGH"), {
      store,
      ...authed("user_guest"),
    });
    expect(res.status).toBe(410);
  });

  it("rejects double-use with 409", async () => {
    const store = new MemoryInvites();
    const minted = await handleMintInvite(mintReq(), {
      store,
      ...authed("user_host"),
    });
    const { code } = (await minted.json()) as { code: string };
    const first = await handleRedeemInvite(redeemReq(code), {
      store,
      ...authed("user_guest"),
    });
    expect(first.status).toBe(200);
    const second = await handleRedeemInvite(redeemReq(code), {
      store,
      ...authed("user_guest"),
    });
    expect(second.status).toBe(409);
  });

  it("fails closed with 401 when unauthenticated", async () => {
    const store = new MemoryInvites();
    expect(
      (await handleMintInvite(mintReq(), { store, ...authed(null) })).status,
    ).toBe(401);
    expect(
      (
        await handleRedeemInvite(redeemReq("ABCDEFGH"), {
          store,
          ...authed(null),
        })
      ).status,
    ).toBe(401);
  });

  it("returns 404 for unknown codes", async () => {
    const store = new MemoryInvites();
    const res = await handleRedeemInvite(redeemReq("ZZZZZZZZ"), {
      store,
      ...authed("user_guest"),
    });
    expect(res.status).toBe(404);
  });
});
