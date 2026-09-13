import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { auth } from "@clerk/nextjs/server";
import { desc, inArray, or, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { friendships, presence, ratings, users } from "@/lib/db/schema";
import { isOnline } from "@/lib/presence/presence";

const MEDAL_COLORS = ["#e2c45c", "#c8ccd4", "#c98a5b"] as const; // gold, silver, bronze

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
        <h1 className="font-heading text-2xl font-semibold">Leaderboard unavailable</h1>
        <p className="text-[var(--dame-muted)]">
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
          <h1 className="font-heading text-3xl font-semibold">Leaderboard</h1>
          <nav
            aria-label="Leaderboard scope"
            className="flex w-fit gap-1 rounded-full border border-[rgba(242,237,227,0.1)] bg-[var(--dame-surface-deep)] p-1 text-sm"
          >
            <Link href="/leaderboard" className="rounded-full px-4 py-1.5 text-[var(--dame-muted)] hover:text-[var(--dame-text)]">
              All
            </Link>
            <span aria-current="page" className="rounded-full bg-[rgba(201,162,39,0.15)] px-4 py-1.5 font-medium text-[var(--dame-accent-hi)]">
              Friends
            </span>
          </nav>
          <p data-testid="leaderboard-friends-signin" className="text-[var(--dame-muted)]">
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
        <h1 className="font-heading text-2xl font-semibold">Leaderboard unavailable</h1>
        <p className="text-[var(--dame-muted)]">
          Could not load ratings due to a database error. Please retry later.
        </p>
      </div>
    );
  }

  const scopeNav = (
    <nav
      aria-label="Leaderboard scope"
      className="flex w-fit gap-1 rounded-full border border-[rgba(242,237,227,0.1)] bg-[var(--dame-surface-deep)] p-1 text-sm"
    >
      {friendsScope ? (
        <>
          <Link href="/leaderboard" className="rounded-full px-4 py-1.5 text-[var(--dame-muted)] hover:text-[var(--dame-text)]">
            All
          </Link>
          <span aria-current="page" className="rounded-full bg-[rgba(201,162,39,0.15)] px-4 py-1.5 font-medium text-[var(--dame-accent-hi)]">
            Friends
          </span>
        </>
      ) : (
        <>
          <span aria-current="page" className="rounded-full bg-[rgba(201,162,39,0.15)] px-4 py-1.5 font-medium text-[var(--dame-accent-hi)]">
            All
          </span>
          <Link href="/leaderboard?scope=friends" className="rounded-full px-4 py-1.5 text-[var(--dame-muted)] hover:text-[var(--dame-text)]">
            Friends
          </Link>
        </>
      )}
    </nav>
  );

  return (
    <div className="grid gap-6 py-4">
      <div className="grid gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-[var(--dame-muted)]">{subtitle}</p>
      </div>
      {scopeNav}
      {rows.length === 0 ? (
        <p
          data-testid="leaderboard-empty"
          className="rounded-[var(--dame-radius)] border border-[rgba(242,237,227,0.08)] bg-[var(--dame-surface-deep)] px-5 py-8 text-center text-[var(--dame-muted)]"
        >
          {friendsScope
            ? "No rated games among you and your friends yet."
            : "No rated games yet — finish a game to claim the top spot."}
        </p>
      ) : (
        <ol data-testid="leaderboard" className="grid gap-2">
          {rows.map((r, i) => {
            const name = names.get(r.clerkId) ?? r.clerkId.slice(0, 12);
            const medal = i < 3 ? MEDAL_COLORS[i] : null;
            return (
              <li
                key={r.clerkId}
                data-testid={`leaderboard-row-${i + 1}`}
                className={`flex items-center gap-3 rounded-[var(--dame-radius)] border px-3 py-2.5 sm:px-4 ${
                  i < 3
                    ? "border-[rgba(201,162,39,0.35)] bg-[rgba(201,162,39,0.06)]"
                    : "border-[rgba(242,237,227,0.08)] bg-[var(--dame-surface-deep)]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                  style={
                    medal
                      ? { background: medal, color: "#241c05" }
                      : {
                          background: "rgba(242,237,227,0.06)",
                          color: "var(--dame-muted)",
                        }
                  }
                >
                  {i + 1}
                </span>
                <span className="grid min-w-0 flex-1 leading-tight">
                  <span className="truncate font-semibold">{name}</span>
                  <span className="text-xs text-[var(--dame-muted)]">
                    {Math.round(r.rating)} rating · RD {Math.round(r.rd)} ·{" "}
                    {r.gamesPlayed} games
                  </span>
                </span>
                {friendsScope ? (
                  <span
                    data-testid={
                      online.get(r.clerkId)
                        ? `friend-online-${r.clerkId}`
                        : `friend-offline-${r.clerkId}`
                    }
                    aria-label={online.get(r.clerkId) ? "Online" : "Offline"}
                    className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--dame-muted)]"
                  >
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-full"
                      style={{
                        background: online.get(r.clerkId) ? "#5fbf6f" : "rgba(242,237,227,0.25)",
                      }}
                    />
                    {online.get(r.clerkId) ? "online" : "offline"}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
