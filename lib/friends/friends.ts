// Friendship core: status transitions + relation helpers.
// Pure except Date; persistence behind FriendStore so unit tests use an
// in-memory store and the route adapts Drizzle to it.

export type FriendshipStatus = "pending" | "accepted" | "declined";

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

export function isClerkId(v: unknown): v is string {
  return typeof v === "string" && v.length >= 1 && v.length <= 128;
}

/** The other party of a friendship row relative to me. */
export function otherParty(row: FriendshipRecord, me: string): string {
  return row.requesterClerkId === me
    ? row.addresseeClerkId
    : row.requesterClerkId;
}
