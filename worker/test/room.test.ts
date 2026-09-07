import { describe, it, expect, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ DurableObject: class {} }));

import { mintJoinToken, verifyJoinToken, verifyClerkToken } from "../src/auth";
import { parseClientFrame, FRAME_LIMIT } from "../src/protocol";
import { createInitialSnapshot, handleJoinFrame } from "../src/room";

const SECRET = "test-secret-hex-0123456789abcdef0123456789abcdef";

describe("GameRoom join/auth (Task 1 RED)", () => {
  it("join accepts valid token", async () => {
    const token = await mintJoinToken("game-123", "white", SECRET, 3600);
    const payload = await verifyJoinToken(token, SECRET, "game-123");
    expect(payload.role).toBe("white");

    const snap = createInitialSnapshot();
    expect(snap.version).toBe(0);

    const result = await handleJoinFrame(
      JSON.stringify({ t: "join", token, lastVersion: 0 }),
      { gameId: "game-123", secret: SECRET },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.role).toBe("white");
      expect(result.snapshot.version).toBe(0);
    }
  });

  it("rejects bad token", async () => {
    const result = await handleJoinFrame(
      JSON.stringify({ t: "join", token: "bad.token.here", lastVersion: 0 }),
      { gameId: "game-123", secret: SECRET },
    );
    expect(result.ok).toBe(false);
  });

  it("rejects cross-game token reuse (game-A token on game-B)", async () => {
    const token = await mintJoinToken("game-A", "white", SECRET, 3600);
    await expect(verifyJoinToken(token, SECRET, "game-B")).rejects.toThrow(
      "token game mismatch",
    );
    const result = await handleJoinFrame(JSON.stringify({ t: "join", token }), {
      gameId: "game-B",
      secret: SECRET,
    });
    expect(result.ok).toBe(false);
  });

  it("malformed frame closes", () => {
    expect(() => parseClientFrame("not-json{{")).toThrow();
    expect(() => parseClientFrame(JSON.stringify({ t: "nope" }))).toThrow();
    expect(() => parseClientFrame("x".repeat(FRAME_LIMIT + 1))).toThrow();
  });

  it("verifyClerkToken good/bad/expired with stubbed fetchImpl", async () => {
    const b64url = (obj: unknown) =>
      Buffer.from(JSON.stringify(obj))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    const keypair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    const pubJwk = (await crypto.subtle.exportKey(
      "jwk",
      keypair.publicKey,
    )) as JsonWebKey & { kid?: string };
    pubJwk.kid = "test-kid";
    const jwksUrl = "https://clerk.test/.well-known/jwks.json";
    const fetchImpl = (async () =>
      ({
        ok: true,
        json: async () => ({ keys: [pubJwk] }),
      }) as unknown as Response) as typeof fetch;
    const sign = async (header: object, claims: object) => {
      const h = b64url(header);
      const p = b64url(claims);
      const sig = new Uint8Array(
        await crypto.subtle.sign(
          "RSASSA-PKCS1-v1_5",
          keypair.privateKey,
          new TextEncoder().encode(`${h}.${p}`),
        ),
      );
      const sigB64 = Buffer.from(sig)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      return `${h}.${p}.${sigB64}`;
    };
    const now = Math.floor(Date.now() / 1000);
    // good
    const good = await sign(
      { alg: "RS256", kid: "test-kid", typ: "JWT" },
      { sub: "user_123", exp: now + 600 },
    );
    const claims = await verifyClerkToken(good, jwksUrl, fetchImpl);
    expect(claims.sub).toBe("user_123");
    // bad signature
    const bad = `${good.slice(0, -1)}${good.endsWith("A") ? "B" : "A"}`;
    await expect(verifyClerkToken(bad, jwksUrl, fetchImpl)).rejects.toThrow();
    // expired
    const expired = await sign(
      { alg: "RS256", kid: "test-kid", typ: "JWT" },
      { sub: "user_123", exp: now - 10 },
    );
    await expect(
      verifyClerkToken(expired, jwksUrl, fetchImpl),
    ).rejects.toThrow("jwt expired");
  });
});
