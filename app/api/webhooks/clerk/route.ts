import { NextResponse } from "next/server";

export async function POST() {
  // Task 4 wires svix verify + Drizzle upsert. Stub keeps route 200 for CI.
  return NextResponse.json({ ok: true, stub: true });
}
