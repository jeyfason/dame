import type { Role } from "./protocol";

export interface JoinPayload {
  gameId: string;
  role: Role;
  exp: number;
}

export interface ClerkClaims {
  sub: string;
  exp?: number;
  [k: string]: unknown;
}

// --- base64url (WebCrypto-safe, no Buffer dependency at runtime) ---

function bytesToB64Url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i] as number);
  }
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (b64.length % 4)) % 4;
  const bin = atob(b64 + "=".repeat(pad));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a.charCodeAt(i) ^ b.charCodeAt(i)) as number;
  }
  return diff === 0;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

// --- HMAC join tokens (minted by Next, verified by worker) ---

export async function mintJoinToken(
  gameId: string,
  role: Role,
  secret: string,
  ttlSec = 3600,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = bytesToB64Url(
    new TextEncoder().encode(JSON.stringify({ gameId, role, exp })),
  );
  const key = await hmacKey(secret);
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)),
  );
  return `${payload}.${bytesToB64Url(sig)}`;
}

export async function verifyJoinToken(
  token: string,
  secret: string,
  expectedGameId?: string,
): Promise<JoinPayload> {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("bad token format");
  }
  const [payloadB64, sigB64] = parts as [string, string];
  const key = await hmacKey(secret);
  const expectSig = bytesToB64Url(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(payloadB64),
      ),
    ),
  );
  if (!timingSafeEqual(expectSig, sigB64)) {
    throw new Error("bad token signature");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(
      new TextDecoder().decode(b64UrlToBytes(payloadB64)),
    );
  } catch {
    throw new Error("bad token payload");
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as Record<string, unknown>).gameId !== "string" ||
    ((payload as Record<string, unknown>).role !== "white" &&
      (payload as Record<string, unknown>).role !== "black") ||
    typeof (payload as Record<string, unknown>).exp !== "number"
  ) {
    throw new Error("bad token claims");
  }
  const p = payload as JoinPayload;
  if (Math.floor(Date.now() / 1000) > p.exp) {
    throw new Error("token expired");
  }
  if (expectedGameId && p.gameId !== expectedGameId) {
    throw new Error("token game mismatch");
  }
  return p;
}

// --- Clerk session verify skeleton (real RS256 JWKS shape) ---
//
// Production JWKS URL shape:
//   https://<clerk-frontend-api>/.well-known/jwks.json
// e.g. https://complete-cricket-3929.clerk.accounts.dev/.well-known/jwks.json
// Tests stub `fetchImpl` — never hit network in unit tests.
// TODO (Task 2 hardening): cache JWKS by kid with TTL + background refresh,
//   and enforce iss/aud claims (issuer = Clerk frontend API, audience = app).

interface JwksResponse {
  keys: Array<{
    kid?: string;
    kty?: string;
    n?: string;
    e?: string;
  } & Record<string, unknown>>;
}

export async function verifyClerkToken(
  jwt: string,
  jwksUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ClerkClaims> {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("bad jwt format");
  const [h0, h1, sigB64] = parts as [string, string, string];
  let header: Record<string, unknown>;
  try {
    header = JSON.parse(
      new TextDecoder().decode(b64UrlToBytes(h0)),
    ) as Record<string, unknown>;
  } catch {
    throw new Error("bad jwt header");
  }
  if (header.alg !== "RS256") throw new Error("unexpected jwt alg");
  const kid = header.kid as string | undefined;

  const res = await fetchImpl(jwksUrl);
  if (!res.ok) throw new Error("jwks fetch failed");
  const jwks = (await res.json()) as JwksResponse;
  const jwk = kid
    ? jwks.keys.find((k) => k.kid === kid)
    : jwks.keys[0];
  if (!jwk || jwk.kty !== "RSA") throw new Error("jwks key not found");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk as JsonWebKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64UrlToBytes(sigB64),
    new TextEncoder().encode(`${h0}.${h1}`),
  );
  if (!ok) throw new Error("bad jwt signature");

  const claims = JSON.parse(
    new TextDecoder().decode(b64UrlToBytes(h1)),
  ) as ClerkClaims;
  if (claims.exp && Math.floor(Date.now() / 1000) > claims.exp) {
    throw new Error("jwt expired");
  }
  if (!claims.sub) throw new Error("jwt missing sub");
  return claims;
}
