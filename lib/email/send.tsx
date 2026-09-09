import * as Sentry from "@sentry/nextjs";
import { Resend } from "resend";
import { InviteEmail } from "@/emails/InviteEmail";
import { ResultEmail, type ResultWinner } from "@/emails/ResultEmail";

// Best-effort transactional email: never throws. Missing RESEND_API_KEY,
// missing recipient, or a Resend failure all resolve { skipped: true } with
// a Sentry breadcrumb so the miss is observable without failing the caller.

export type SendResult = { skipped: true } | { sent: true };

// TODO: set EMAIL_FROM to a verified domain (e.g. Dame <noreply@dame.gg>).
// Default onboarding@resend.dev only delivers to the Resend account owner.
const FROM = process.env.EMAIL_FROM ?? "Dame <onboarding@resend.dev>";

// Transactional throttle: max 5 sends/hour per recipient (in-memory map).
// Minimal by intent: stops invite/finish loops from spamming one address
// without a DB column or queue. Resets on deploy/scale-to-zero; upgrade to
// DB/Redis-backed counting if abuse persists or instances fan out.
const SEND_WINDOW_MS = 60 * 60 * 1000;
const MAX_SENDS_PER_WINDOW = 5;
const sendTimes = new Map<string, number[]>();

function throttled(to: string, now: number = Date.now()): boolean {
  const key = to.trim().toLowerCase();
  const recent = (sendTimes.get(key) ?? []).filter((t) => now - t < SEND_WINDOW_MS);
  if (recent.length >= MAX_SENDS_PER_WINDOW) {
    sendTimes.set(key, recent);
    return true;
  }
  recent.push(now);
  sendTimes.set(key, recent);
  return false;
}

/** Test-only: clear the in-memory throttle. */
export function __resetEmailThrottleForTests(): void {
  sendTimes.clear();
}

function crumb(message: string, data?: Record<string, unknown>) {
  try {
    Sentry.addBreadcrumb({ category: "email", level: "info", message, data });
  } catch {
    // Breadcrumbs must never break the send path.
  }
}

async function send(opts: {
  to?: string;
  subject: string;
  react: React.ReactNode;
  kind: string;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    crumb("email skipped: no RESEND_API_KEY", { kind: opts.kind });
    return { skipped: true };
  }
  // Central recipient validation: missing or "@"-less addresses never send.
  // Route-level asEmail checks mirror this; defense-in-depth for direct callers.
  if (!opts.to || !opts.to.includes("@")) {
    crumb("email skipped: no recipient", { kind: opts.kind });
    return { skipped: true };
  }
  if (throttled(opts.to)) {
    crumb("email skipped: rate-limited", { kind: opts.kind });
    return { skipped: true };
  }
  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: opts.subject,
      react: opts.react,
    });
    if (error) {
      crumb("email failed", { kind: opts.kind, error: error.message });
      return { skipped: true };
    }
    crumb("email sent", { kind: opts.kind });
    return { sent: true };
  } catch (e) {
    crumb("email threw", {
      kind: opts.kind,
      error: e instanceof Error ? e.message : String(e),
    });
    return { skipped: true };
  }
}

export function sendInviteEmail(opts: {
  to?: string;
  hostName: string;
  code: string;
  inviteUrl: string;
}): Promise<SendResult> {
  return send({
    to: opts.to,
    kind: "invite",
    subject: `${opts.hostName} invited you to a game of Dame`,
    react: (
      <InviteEmail
        hostName={opts.hostName}
        code={opts.code}
        inviteUrl={opts.inviteUrl}
      />
    ),
  });
}

export function sendResultEmail(opts: {
  to?: string;
  gameId: string;
  winner: ResultWinner;
  whiteName: string;
  blackName: string;
  whiteDelta: number;
  blackDelta: number;
  rematchUrl: string;
}): Promise<SendResult> {
  return send({
    to: opts.to,
    kind: "result",
    subject: "Your Dame game result",
    react: (
      <ResultEmail
        gameId={opts.gameId}
        winner={opts.winner}
        whiteName={opts.whiteName}
        blackName={opts.blackName}
        whiteDelta={opts.whiteDelta}
        blackDelta={opts.blackDelta}
        rematchUrl={opts.rematchUrl}
      />
    ),
  });
}
