"use client";

import { useState } from "react";

// Voice stub UI: join is disabled until the voice flag path lands
// (Stage 6). Mute toggle is local UI state only — no audio wiring yet.
export function VoiceBar({
  enabled = false,
  initialMuted = true,
  onMutedChange,
}: {
  enabled?: boolean;
  initialMuted?: boolean;
  onMutedChange?: (muted: boolean) => void;
}) {
  const [muted, setMuted] = useState(initialMuted);

  function toggle() {
    const next = !muted;
    setMuted(next);
    onMutedChange?.(next);
  }

  return (
    <section
      data-testid="voice-bar"
      data-state={enabled ? "ready" : "disabled"}
      aria-label="Voice chat"
      className="grid gap-3 rounded-[var(--dame-radius)] border border-white/10 p-4"
      style={{ background: "var(--dame-felt-deep)" }}
    >
      <h3 className="text-sm font-bold tracking-wide uppercase">Voice</h3>
      <p className="text-sm opacity-70">
        {!enabled
          ? "Voice chat is off for this match."
          : muted
            ? "You are muted."
            : "Your mic is live."}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="voice-join"
          aria-label="Join voice chat"
          disabled={!enabled}
          className="min-h-[44px] cursor-pointer rounded-[var(--dame-radius)] px-5 py-2 text-sm font-semibold text-black transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "var(--dame-gold)" }}
        >
          Join voice
        </button>
        {enabled && (
          <button
            type="button"
            data-testid="voice-mute-toggle"
            aria-label="Toggle microphone mute"
            aria-pressed={muted}
            onClick={toggle}
            className="min-h-[44px] min-w-[44px] cursor-pointer rounded-[var(--dame-radius)] border border-white/20 px-5 py-2 text-sm transition-opacity duration-150 hover:opacity-80"
          >
            {muted ? "Muted" : "Unmuted"}
          </button>
        )}
      </div>
    </section>
  );
}
