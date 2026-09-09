import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { auth } from "@clerk/nextjs/server";
import { desc, inArray, or, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { friendships, presence, ratings, users } from "@/lib/db/schema";
import { isOnline } from "@/lib/presence/presence";

// Public top-100 ladder by rating. Reads only; degrades to an empty state
// when the database is unreachable (fail-closed, never 500s the page).
// ?scope=friends filters to the signed-in user's accepted friends (+ self)
// with online dots from presence (last_seen < 5min).
export default async function Leaderboard({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  if (!process.env.DATABASE_URL) {
    return (
      <div className="py-10">
        <h2 className="text-2xl font-bold">Leaderboard unavailable</h2>
        <p className="opacity-70">
          Ratings are not configured yet. Please retry later.
        </p>
      </div>
    );
  }
  const sp = await searchParams;
  const friendsScope = sp?.scope === "friends";

  let viewerId: string | null = null;
  if (friendsScope) {
    try {
      const { isAuthenticated, userId } = await auth();
      viewerId = isAuthenticated ? userId : null;
    } catch {
      viewerId = null;
    }
    if (!viewerId) {
      return (
        <div className="grid gap-6 py-8">
          <h2 className="text-2xl font-bold">Leaderboard</h2>
          <nav aria-label="Leaderboard scope" className="flex gap-3 text-sm">
            <Link href="/leaderboard" className="underline">
              All
            </Link>
            <span aria-current="page" className="opacity-70">
              Friends
            </span>
          </nav>
          <p data-testid="leaderboard-friends-signin" className="opacity-70">
            Sign in to see your friends leaderboard.
          </p>
        </div>
      );
    }
  }

  let rows: (typeof ratings.$inferSelect)[] = [];
  let names = new Map<string, string>();
  let online = new Map<string, boolean>();
  let title = "Leaderboard";
  let subtitle = "";
  try {
    if (friendsScope && viewerId) {
      const links = await db
        .select()
        .from(friendships)
        .where(
          or(
            eq(friendships.requesterClerkId, viewerId),
            eq(friendships.addresseeClerkId, viewerId),
          ),
        )
        .limit(1000);
      const friendIds = links
        .filter((l) => l.status === "accepted")
        .map((l) =>
          l.requesterClerkId === viewerId
            ? l.addresseeClerkId
            : l.requesterClerkId,
        );
      const ids = [viewerId, ...friendIds];
      rows = await db
        .select()
        .from(ratings)
        .where(inArray(ratings.clerkId, ids))
        .orderBy(desc(ratings.rating))
        .limit(100);
      title = "Friends leaderboard";
      subtitle = `You + ${friendIds.length} friend${friendIds.length === 1 ? "" : "s"}.`;
      // Presence is best-effort (mirrors GET /api/friends): a failing seen
      // lookup degrades to all-offline, never to the unavailable page.
      try {
        if (rows.length > 0) {
          const seen = await db
            .select()
            .from(presence)
            .where(
              inArray(
                presence.clerkId,
                rows.map((r) => r.clerkId),
              ),
            );
          const seenMap = new Map(seen.map((s) => [s.clerkId, s.lastSeen]));
          const now = new Date();
          online = new Map(
            rows.map((r) => [r.clerkId, isOnline(seenMap.get(r.clerkId), now)]),
          );
        }
      } catch {
        online = new Map<string, boolean>();
      }
    } else {
      rows = await db
        .select()
        .from(ratings)
        .orderBy(desc(ratings.rating))
        .limit(100);
      subtitle = `Top ${rows.length} rated players.`;
    }
    if (rows.length > 0) {
      const ids = rows.map((r) => r.clerkId);
      const userRows = await db
        .select()
        .from(users)
        .where(inArray(users.clerkId, ids));
      names = new Map(
        userRows
          .filter((u) => u.displayName)
          .map((u) => [u.clerkId, u.displayName as string]),
      );
    }
  } catch (err) {
    Sentry.captureException(err);
    console.error("leaderboard: failed to load ratings", err);
    return (
      <div className="py-10">
        <h2 className="text-2xl font-bold">Leaderboard unavailable</h2>
        <p className="opacity-70">
          Could not load ratings due to a database error. Please retry later.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-6 py-8">
      <h2 className="text-2xl font-bold">{title}</h2>
      <nav aria-label="Leaderboard scope" className="flex gap-3 text-sm">
        {friendsScope ? (
          <>
            <Link href="/leaderboard" className="underline">
              All
            </Link>
            <span aria-current="page" className="opacity-70">
              Friends
            </span>
          </>
        ) : (
          <>
            <span aria-current="page" className="opacity-70">
              All
            </span>
            <Link href="/leaderboard?scope=friends" className="underline">
              Friends
            </Link>
          </>
        )}
      </nav>
      <p className="text-sm opacity-70">{subtitle}</p>
      {rows.length === 0 ? (
        <p data-testid="leaderboard-empty" className="opacity-70">
          {friendsScope
            ? "No rated games among you and your friends yet."
            : "No rated games yet — finish a game to claim the top spot."}
        </p>
      ) : (
        <ol data-testid="leaderboard" className="grid gap-2">
          {rows.map((r, i) => (
            <li
              key={r.clerkId}
              data-testid={`leaderboard-row-${i + 1}`}
              className="flex items-center justify-between rounded-[var(--dame-radius)] border border-white/10 px-4 py-3"
              style={{ background: "var(--dame-felt-deep)" }}
            >
              <span className="font-semibold">
                #{i + 1} {names.get(r.clerkId) ?? r.clerkId.slice(0, 12)}
                {friendsScope ? (
                  <span
                    data-testid={
                      online.get(r.clerkId)
                        ? `friend-online-${r.clerkId}`
                        : `friend-offline-${r.clerkId}`
                    }
                    aria-label={online.get(r.clerkId) ? "Online" : "Offline"}
                    className="ml-2 text-xs"
                  >
                    {online.get(r.clerkId) ? "● online" : "○ offline"}
                  </span>
                ) : null}
              </span>
              <span className="text-sm opacity-70">
                {Math.round(r.rating)} · RD {Math.round(r.rd)} ·{" "}
                {r.gamesPlayed} games
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
