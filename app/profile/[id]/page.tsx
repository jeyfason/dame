import * as Sentry from "@sentry/nextjs";
import { asc, desc, eq, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { games, ratingHistory, ratings, users } from "@/lib/db/schema";
import { DEFAULT_RATING, DEFAULT_RD } from "@/lib/ratings/glicko2";
import { FriendButton } from "@/components/dame/FriendButton";

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
        <h1 className="font-heading text-2xl font-semibold">Profile unavailable</h1>
        <p className="text-[var(--dame-muted)]">Could not load this profile (database not configured). Please retry later.</p>
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
        <h1 className="font-heading text-2xl font-semibold">Profile unavailable</h1>
        <p className="text-[var(--dame-muted)]">Could not load this profile due to a database error. Please retry later.</p>
      </div>
    );
  }
  if (!row) {
    return (
      <div className="py-16 text-center text-[var(--dame-muted)]">
        Profile not found yet — sign in to create yours.
      </div>
    );
  }

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

  const tiles: { label: string; value: string; testid?: string }[] = [
    { label: "Rating", value: String(Math.round(rating.rating)), testid: "profile-rating" },
    { label: "RD", value: String(Math.round(rating.rd)) },
    { label: "Games", value: String(rating.gamesPlayed) },
    { label: "Record", value: `${wins}W · ${losses}L · ${draws}D`, testid: "profile-record" },
  ];

  return (
    <div className="grid gap-6 py-4">
      {/* Card header */}
      <section
        aria-label="Player"
        className="flex flex-wrap items-center gap-5 rounded-[var(--dame-radius)] border border-[rgba(242,237,227,0.08)] bg-[var(--dame-surface-deep)] p-5 sm:p-6"
      >
        {row.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.avatarUrl}
            alt={`${row.displayName ?? "Player"} avatar`}
            className="h-16 w-16 rounded-full ring-2 ring-[rgba(201,162,39,0.4)]"
          />
        ) : (
          <div
            aria-label="Avatar placeholder"
            className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold"
            style={{ background: "rgba(201,162,39,0.14)", color: "var(--dame-accent-hi)" }}
          >
            {(row.displayName ?? "P").slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="grid min-w-0 gap-0.5">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {row.displayName ?? "Player"}
          </h1>
          <p className="text-sm text-[var(--dame-muted)]">{row.country ?? "Country not set yet."}</p>
          <p className="text-xs text-[var(--dame-muted)]">
            Joined {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "recently"}
          </p>
        </div>
        <div className="ml-auto">
          <FriendButton userId={id} />
        </div>
      </section>

      {row.bio ? <p className="text-[var(--dame-muted)]">{row.bio}</p> : null}

      {/* Rating tiles */}
      <section aria-label="Rating" className="grid gap-4">
        <h2 className="sr-only">Rating</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((t) => (
            <div
              key={t.label}
              className="grid content-start gap-1 rounded-[var(--dame-radius)] border border-[rgba(242,237,227,0.08)] bg-[var(--dame-surface-deep)] p-4"
            >
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--dame-muted)]">
                {t.label}
              </span>
              <span
                {...(t.testid ? { "data-testid": t.testid } : {})}
                className={`font-heading text-2xl font-semibold ${
                  t.label === "Rating" ? "" : "text-lg"
                }`}
              >
                {t.value}
              </span>
            </div>
          ))}
        </div>
        <div className="rounded-[var(--dame-radius)] border border-[rgba(242,237,227,0.08)] bg-[var(--dame-surface-deep)] p-4">
          <h3 className="mb-2 text-sm font-semibold text-[var(--dame-muted)]">
            Rating history
          </h3>
          {spark ? (
            <svg
              data-testid="rating-sparkline"
              data-points={points.join(",")}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="h-20 w-full"
              role="img"
              aria-label={`Rating history: ${points.join(", ")}`}
            >
              <polyline
                points={spark}
                fill="none"
                stroke="var(--dame-accent)"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <p data-testid="rating-sparkline-empty" className="py-2 text-sm text-[var(--dame-muted)]">
              No rated games yet — history appears after the first finish.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
