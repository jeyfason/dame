"use client";

import { useCallback, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isSoundEnabled, setSoundEnabled } from "@/lib/sound";

export function SoundToggle() {
  const [on, setOn] = useState<boolean>(() => isSoundEnabled());

  const toggle = useCallback(() => {
    setOn((prev) => {
      const next = !prev;
      setSoundEnabled(next);
      return next;
    });
  }, []);

  return (
    <button
      type="button"
      data-testid="sound-toggle"
      aria-pressed={on ? "true" : "false"}
      aria-label={on ? "Mute sound effects" : "Unmute sound effects"}
      title={on ? "Sound on" : "Sound off"}
      onClick={toggle}
      className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center gap-2 rounded-[var(--dame-radius)] border border-[rgba(242,237,227,0.14)] bg-[var(--dame-surface-deep)] px-3 text-[var(--dame-muted)] transition-colors duration-150 hover:border-[rgba(201,162,39,0.4)] hover:text-[var(--dame-accent-hi)]"
    >
      {on ? <Volume2 size={18} /> : <VolumeX size={18} />}
    </button>
  );
}
