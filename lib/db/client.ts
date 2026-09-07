import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

const sql = neon(process.env.DATABASE_URL ?? "postgresql://user:pass@localhost.local/dummy?sslmode=require");
export const db = drizzle(sql);
