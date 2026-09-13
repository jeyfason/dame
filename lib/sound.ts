export type SoundKind = "move" | "capture" | "win" | "invalid";

export const SOUND_STORAGE_KEY = "dame:sound-enabled";

export function isSoundEnabled(): boolean {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return true;
  try {
    const raw = localStorage.getItem(SOUND_STORAGE_KEY);
    if (raw === null) return true;
    return raw !== "0" && raw !== "false" && raw !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, on ? "1" : "0");
  } catch {
    // storage unavailable — stay silent about it
  }
}

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ??
    (window as unknown as Record<string, unknown>).webkitAudioContext;
  if (typeof AC !== "function") return null;
  try {
    if (!ctx) {
      ctx = new (AC as typeof AudioContext)();
    }
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  ac: AudioContext,
  freq: number,
  startAt: number,
  dur: number,
  type: OscillatorType = "sine",
  gainPeak = 0.12,
): void {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(gainPeak, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(startAt);
  osc.stop(startAt + dur + 0.02);
}

/** Synth SFX. Lazy AudioContext = first-gesture start (called from click handlers). No-op when disabled. */
export function playSound(kind: SoundKind): void {
  if (!isSoundEnabled()) return;
  const ac = getCtx();
  if (!ac) return;
  const t = ac.currentTime;
  try {
    if (kind === "move") {
      tone(ac, 660, t, 0.09);
    } else if (kind === "capture") {
      tone(ac, 330, t, 0.1, "triangle");
      tone(ac, 495, t + 0.07, 0.14, "triangle");
    } else if (kind === "invalid") {
      // Low wooden "thud" for invalid taps / not-your-turn.
      tone(ac, 110, t, 0.12, "triangle", 0.16);
      tone(ac, 82, t + 0.02, 0.14, "sine", 0.14);
    } else {
      tone(ac, 523.25, t, 0.14);
      tone(ac, 659.25, t + 0.11, 0.14);
      tone(ac, 783.99, t + 0.22, 0.22);
    }
  } catch {
    // audio failures must never break gameplay
  }
}

export function playMove(): void {
  playSound("move");
}

export function playCapture(): void {
  playSound("capture");
}

let faahAudio: HTMLAudioElement | null = null;
const FAAH_SRC = "/sounds/faah.mp3";

/**
 * "Faah!" call-out for multi-captures (2+ men eaten in one move).
 * Uses the recorded sample instead of the synth; respects the sound toggle.
 */
export function playMultiCapture(): void {
  if (!isSoundEnabled()) return;
  if (typeof window === "undefined" || typeof window.Audio !== "function") return;
  try {
    if (!faahAudio) {
      faahAudio = new window.Audio(FAAH_SRC);
      faahAudio.preload = "auto";
    }
    faahAudio.currentTime = 0;
    void faahAudio.play().catch(() => {
      // autoplay/decode failures must never break gameplay
    });
  } catch {
    // audio failures must never break gameplay
  }
}

export function playWin(): void {
  playSound("win");
}

/** Low wooden thud for invalid taps / not-your-turn feedback. */
export function playInvalid(): void {
  playSound("invalid");
}

/** Test hook: drop the cached context so jsdom tests stay isolated. */
export function __resetSoundForTests(): void {
  ctx = null;
  faahAudio = null;
}
