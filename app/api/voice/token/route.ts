import { NextResponse } from "next/server";
import { getFlag } from "@/lib/flags/getFlag";

// Voice token stub: 503 { error: "voice-disabled" } unless the `voice`
// feature flag is on AND LiveKit credentials are present. Full LiveKit
// join + cost review is tracked for Stage 6 (no livekit dep yet), so the
// enabled path returns a clearly-labeled stub token, never real creds.

export interface LivekitEnv {
  key: string | undefined;
  secret: string | undefined;
  url: string | undefined;
}

export interface VoiceTokenDeps {
  voiceEnabled: () => Promise<boolean>;
  livekitEnv: () => LivekitEnv;
}

const defaultDeps: VoiceTokenDeps = {
  voiceEnabled: () => getFlag("voice"),
  livekitEnv: () => ({
    key: process.env.LIVEKIT_API_KEY,
    secret: process.env.LIVEKIT_API_SECRET,
    url: process.env.LIVEKIT_URL,
  }),
};

export async function handleVoiceToken(
  _req: Request,
  deps: VoiceTokenDeps = defaultDeps,
): Promise<Response> {
  const enabled = await deps.voiceEnabled();
  const env = deps.livekitEnv();
  if (!enabled || !env.key || !env.secret) {
    return NextResponse.json({ error: "voice-disabled" }, { status: 503 });
  }
  return NextResponse.json({ token: "voice-stub", url: env.url ?? null });
}

export async function POST(req: Request) {
  return handleVoiceToken(req);
}

export async function GET(req: Request) {
  return handleVoiceToken(req);
}
