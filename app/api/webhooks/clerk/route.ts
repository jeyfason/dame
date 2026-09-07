import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "missing secret" }, { status: 500 });
  const payload = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };
  type ClerkEvent = {
    type: string;
    data: {
      id: string;
      first_name?: string | null;
      last_name?: string | null;
      username?: string | null;
      image_url?: string | null;
    };
  };
  let evt: ClerkEvent;
  try {
    evt = new Webhook(secret).verify(payload, headers) as unknown as ClerkEvent;
  } catch {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }
  if (evt.type === "user.created" || evt.type === "user.updated") {
    const u = evt.data;
    const clerkId = u.id as string;
    const displayName = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || null;
    const avatarUrl = u.image_url ?? null;
    const existing = await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1);
    if (existing.length === 0) {
      await db.insert(users).values({ clerkId, displayName, avatarUrl });
    } else {
      await db.update(users).set({ displayName, avatarUrl, updatedAt: new Date() }).where(eq(users.clerkId, clerkId));
    }
  }
  return NextResponse.json({ ok: true });
}
