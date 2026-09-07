import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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
  let dbError = false;
  try {
    const rows = await db.select().from(users).where(eq(users.clerkId, id)).limit(1);
    row = rows[0] ?? null;
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
      <p className="text-sm opacity-70">Rating pools: Blitz / Rapid / Classical — ratings land in Stage 2.</p>
    </div>
  );
}
