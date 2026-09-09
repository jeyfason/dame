import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

// Dev-gated test route: fail-closed in production (404), no secrets logged.
// Hit GET /api/sentry-test in dev to send a test event, confirm in Sentry
// dashboard, then use the returned eventId to verify the pipeline.
export function isSentryTestAllowed(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return nodeEnv !== "production";
}

export function getSentryRelease(): string {
  return (
    process.env.SENTRY_RELEASE ??
    process.env.NEXT_PUBLIC_SENTRY_RELEASE ??
    "dev"
  );
}

export async function GET() {
  if (!isSentryTestAllowed()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const eventId = Sentry.captureMessage("sentry-test ping");
  return NextResponse.json({
    ok: true,
    eventId: eventId ?? "unknown",
    release: getSentryRelease(),
  });
}
