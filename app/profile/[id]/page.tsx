import * as Sentry from "@sentry/nextjs";
import { asc, desc, eq, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { games, ratingHistory, ratings, users } from "@/lib/db/schema";
import { DEFAULT_RATING, DEFAULT_RD } from "@/lib/ratings/glicko2";

function resultFor(
  player: string,
  g: typeof games.$inferSelect,
): "win" | "loss" | "draw" | null {
  if (g.winner === "draw") return "draw";
  if (g.winner === "white")
    return g.whiteClerkId === player ? "win" : "loss";
  if (g.winner === "black")
    return g.blackClerkId === player ? "win" : "loss";
  return null;
}

export default async function Profile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!process.env.DATABASE_URL) {
    return (
      <div className="py-10">
        <h2 className="text-2xl font-bold">Profile unavailable</h2>
        <p className="opacity-70">Could not load this profile (database not configured). Please retry later.</p>
      </div>
    );
  }
  let row: typeof users.$inferSelect | null = null;
  let rating = { rating: DEFAULT_RATING, rd: DEFAULT_RD, gamesPlayed: 0 };
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let history: { rating: number; at: Date }[] = [];
  let dbError = false;
  try {
    const [userRows, ratingRows, gameRows, historyRows] = await Promise.all([
      db.select().from(users).where(eq(users.clerkId, id)).limit(1),
      db.select().from(ratings).where(eq(ratings.clerkId, id)).limit(1),
      db
        .select()
        .from(games)
        .where(or(eq(games.whiteClerkId, id), eq(games.blackClerkId, id)))
        .orderBy(desc(games.finishedAt))
        .limit(500),
      db
        .select()
        .from(ratingHistory)
        .where(eq(ratingHistory.clerkId, id))
        .orderBy(asc(ratingHistory.at))
        .limit(500),
    ]);
    row = userRows[0] ?? null;
    const r = ratingRows[0];
    if (r) {
      rating = { rating: r.rating, rd: r.rd, gamesPlayed: r.gamesPlayed };
    }
    for (const g of gameRows) {
      const res = resultFor(id, g);
      if (res === "win") wins++;
      else if (res === "loss") losses++;
      else if (res === "draw") draws++;
    }
    history = historyRows.map((h) => ({ rating: h.rating, at: h.at }));
  } catch (err) {
    dbError = true;
    Sentry.captureException(err);
    console.error("profile: failed to load user", err);
  }
  if (dbError) {
    return (
      <div className="py-10">
        <h2 className="text-2xl font-bold">Profile unavailable</h2>
        <p className="opacity-70">Could not load this profile due to a database error. Please retry later.</p>
      </div>
    );
  }
  if (!row) return <div className="py-10">Profile not found yet — sign in to create yours.</div>;

  const points = history.map((h) => Math.round(h.rating));
  const lo = points.length > 0 ? Math.min(...points) : 0;
  const hi = points.length > 0 ? Math.max(...points) : 0;
  const spark =
    points.length > 1
      ? points
          .map((p, i) => {
            const x = (i / (points.length - 1)) * 100;
            const y = hi === lo ? 50 : 100 - ((p - lo) / (hi - lo)) * 100;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ")
      : "";

  return (
    <div className="grid gap-6 py-10">
      <div className="flex items-center gap-4">
        {row.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.avatarUrl} alt={`${row.displayName ?? "Player"} avatar`} className="h-16 w-16 rounded-full" />
        ) : (
          <div aria-label="Avatar placeholder" className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-xl font-bold">
            {(row.displayName ?? "P").slice(0, 1).toUpperCase()}
          </div>
        )}
        <div>
          <h2 className="text-2xl font-bold">{row.displayName ?? "Player"}</h2>
          <p className="opacity-70">{row.country ?? "Country not set yet."}</p>
          <p className="text-sm opacity-70">Joined {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "recently"}.</p>
        </div>
      </div>
      <p className="opacity-70">{row.bio ?? "No bio yet."}</p>

      <section
        aria-label="Rating"
        className="rounded-[var(--dame-radius)] border border-white/10 p-5"
        style={{ background: "var(--dame-felt-deep)" }}
      >
        <h3 className="text-lg font-bold">Rating</h3>
        <p data-testid="profile-rating" className="mt-1 text-3xl font-extrabold">
          {Math.round(rating.rating)}
          <span className="ml-2 text-sm font-normal opacity-70">
            RD {Math.round(rating.rd)} · {rating.gamesPlayed} games
          </span>
        </p>
        <p data-testid="profile-record" className="mt-1 text-sm opacity-70">
          {wins}W · {losses}L · {draws}D
        </p>
        {spark ? (
          <svg
            data-testid="rating-sparkline"
            data-points={points.join(",")}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="mt-3 h-16 w-full"
            role="img"
            aria-label={`Rating history: ${points.join(", ")}`}
          >
            <polyline
              points={spark}
              fill="none"
              stroke="var(--dame-teal)"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <p data-testid="rating-sparkline-empty" className="mt-3 text-sm opacity-70">
            No rated games yet — history appears after the first finish.
          </p>
        )}
      </section>
    </div>
  );
}
