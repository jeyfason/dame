import { pgTable, uuid, text, boolean, integer, timestamp, real, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkId: text("clerk_id").notNull().unique(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  country: text("country"),
  bio: text("bio"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  rolloutPct: integer("rollout_pct").notNull().default(0),
});

export const games = pgTable("games", {
  id: uuid("id").primaryKey(),
  whiteClerkId: text("white_clerk_id").notNull(),
  blackClerkId: text("black_clerk_id").notNull(),
  winner: text("winner"),
  reason: text("reason"),
  moves: jsonb("moves").$type<unknown[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const ratings = pgTable("ratings", {
  clerkId: text("clerk_id").primaryKey(),
  rating: real("rating").notNull().default(1500),
  rd: real("rd").notNull().default(350),
  vol: real("vol").notNull().default(0.06),
  gamesPlayed: integer("games_played").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

// NOTE: tables link by raw ids with NO foreign-key constraints, by intent:
// neon-http has no multi-statement transactions, so the finish route owns
// idempotency in app code (game PK-conflict + guarded history writes) and
// must never deadlock on cross-table FK checks during sequential retries.
export const ratingHistory = pgTable("rating_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkId: text("clerk_id").notNull(),
  gameId: uuid("game_id").notNull(),
  rating: real("rating").notNull(),
  rd: real("rd").notNull(),
  at: timestamp("at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (t) => [
  // One row per (game, player): makes history writes idempotent so crash
  // recovery and retried duplicate finishes cannot double-insert.
  uniqueIndex("rating_history_game_clerk_uniq").on(t.gameId, t.clerkId),
]);

export const invites = pgTable("invites", {
  code: text("code").primaryKey(),
  hostClerkId: text("host_clerk_id").notNull(),
  gameId: uuid("game_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
});

// Stage 5 social: friendships + presence. No FK constraints by intent (see
// note above): neon-http has no multi-statement transactions, so routes own
// idempotency in app code and must never deadlock on cross-table FK checks.
// Pair uniqueness is unordered: the ordered (requester, addressee) index
// below covers the common case, and drizzle/0005_friendships_unordered.sql
// adds a LEAST/GREATEST expression index as the race backstop for concurrent
// opposite-direction inserts (A→B + B→A). The friends route pre-checks with
// findBetween and maps both the pre-check hit and SQLSTATE 23505 to 409.
export const friendships = pgTable("friendships", {
  id: uuid("id").defaultRandom().primaryKey(),
  requesterClerkId: text("requester_clerk_id").notNull(),
  addresseeClerkId: text("addressee_clerk_id").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("friendships_pair_uniq").on(t.requesterClerkId, t.addresseeClerkId),
]);

// Heartbeat table: one row per Clerk user, upserted on room join/move
// (and POST /api/presence). Online = last_seen within the last 5 minutes.
export const presence = pgTable("presence", {
  clerkId: text("clerk_id").primaryKey(),
  lastSeen: timestamp("last_seen", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
