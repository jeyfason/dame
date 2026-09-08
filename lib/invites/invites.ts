// Friend-invite core: code mint + single-use redeem checks.
// Pure except crypto randomness/UUID; persistence behind InviteStore so
// unit tests use an in-memory store and the route adapts Drizzle to it.

export const INVITE_TTL_MS = 24 * 3600 * 1000;
export const INVITE_CODE_LEN = 8;

// Crockford-ish: unambiguous uppercase alphanumerics only.
export const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export interface InviteRecord {
  code: string;
  hostClerkId: string;
  gameId: string;
  expiresAt: Date;
  usedAt: Date | null;
}

export interface InviteStore {
  insert(invite: InviteRecord): Promise<void>;
  findByCode(code: string): Promise<InviteRecord | null>;
  /**
   * Atomically consume a fresh code: set usedAt and return the row.
   * Returns null when the code is missing or already used (lost a race).
   */
  markUsed(code: string, now: Date): Promise<InviteRecord | null>;
}

export function generateCode(
  rand: (n: number) => number = defaultRand,
): string {
  let out = "";
  for (let i = 0; i < INVITE_CODE_LEN; i++) {
    out += INVITE_ALPHABET[rand(INVITE_ALPHABET.length)];
  }
  return out;
}

function defaultRand(n: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] ?? 0) % n;
}

/** Host mints: fresh code + new gameId UUID + 24h expiry. Host plays white. */
export function mintInviteRecord(
  hostClerkId: string,
  now: Date = new Date(),
  gen: () => string = generateCode,
): InviteRecord {
  return {
    code: gen(),
    hostClerkId,
    gameId: crypto.randomUUID(),
    expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    usedAt: null,
  };
}

/** Normalize user-entered codes: trim + uppercase. */
export function normalizeCode(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const code = v.trim().toUpperCase();
  if (!new RegExp(`^[${INVITE_ALPHABET}]{${INVITE_CODE_LEN}}$`).test(code)) {
    return null;
  }
  return code;
}

/** Redeem guard: unknown / expired / already-used. Null when redeemable. */
export function redeemCheck(
  row: InviteRecord | null,
  now: Date,
): { status: 404 | 409 | 410 } | null {
  if (!row) return { status: 404 };
  if (row.expiresAt.getTime() <= now.getTime()) return { status: 410 };
  if (row.usedAt) return { status: 409 };
  return null;
}
