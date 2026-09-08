import * as Sentry from "@sentry/nextjs";
import { desc, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { ratings, users } from "@/lib/db/schema";

// Public top-100 ladder by rating. Reads only; degrades to an empty state
// when the database is unreachable (fail-closed, never 500s the page).
export default async function Leaderboard() {
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
  let rows: (typeof ratings.$inferSelect)[] = [];
  let names = new Map<string, string>();
  try {
    rows = await db
      .select()
      .from(ratings)
      .orderBy(desc(ratings.rating))
      .limit(100);
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
      <h2 className="text-2xl font-bold">Leaderboard</h2>
      <p className="text-sm opacity-70">Top {rows.length} rated players.</p>
      {rows.length === 0 ? (
        <p data-testid="leaderboard-empty" className="opacity-70">
          No rated games yet — finish a game to claim the top spot.
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
