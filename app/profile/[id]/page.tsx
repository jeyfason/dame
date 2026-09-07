import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export default async function Profile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let row = null;
  try {
    const rows = await db.select().from(users).where(eq(users.clerkId, id)).limit(1);
    row = rows[0] ?? null;
  } catch {
    row = null;
  }
  if (!row) return <div className="py-10">Profile not found yet — sign in to create yours.</div>;
  return (
    <div className="py-10">
      <h2 className="text-2xl font-bold">{row.displayName ?? "Player"}</h2>
      <p className="opacity-70">{row.bio ?? "No bio yet."}</p>
    </div>
  );
}
