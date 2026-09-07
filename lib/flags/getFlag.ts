import { db } from "../db/client";
import { featureFlags } from "../db/schema";
import { eq } from "drizzle-orm";

export async function getFlag(key: string): Promise<boolean> {
  try {
    if (!process.env.DATABASE_URL) return false;
    const rows = await db.select().from(featureFlags).where(eq(featureFlags.key, key)).limit(1);
    return rows[0]?.enabled ?? false;
  } catch {
    return false;
  }
}
