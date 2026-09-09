"use client";

import { useCallback, useEffect, useState } from "react";
import { isSoundEnabled, setSoundEnabled } from "@/lib/sound";

export function SoundToggle() {
  const [on, setOn] = useState<boolean>(true);

  useEffect(() => {
    setOn(isSoundEnabled());
  }, []);

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
      onClick={toggle}
      className="min-h-[44px] cursor-pointer rounded-[var(--dame-radius)] border border-white/20 px-5 py-3 font-semibold transition-colors duration-200"
      style={{ background: "var(--dame-felt-deep)" }}
    >
      {on ? "Sound on" : "Sound off"}
    </button>
  );
}
