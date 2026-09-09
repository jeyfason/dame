// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { render, screen, fireEvent } from "@testing-library/react";
import { SoundToggle } from "./SoundToggle";
import {
  SOUND_STORAGE_KEY,
  isSoundEnabled,
  setSoundEnabled,
  playSound,
} from "@/lib/sound";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("sound lib", () => {
  it("defaults on when nothing stored", () => {
    expect(isSoundEnabled()).toBe(true);
  });

  it("persists toggle to localStorage", () => {
    setSoundEnabled(false);
    expect(localStorage.getItem(SOUND_STORAGE_KEY)).toBe("0");
    expect(isSoundEnabled()).toBe(false);
    setSoundEnabled(true);
    expect(localStorage.getItem(SOUND_STORAGE_KEY)).toBe("1");
    expect(isSoundEnabled()).toBe(true);
  });

  it("is silent when disabled: creates no AudioContext", () => {
    setSoundEnabled(false);
    const AC = vi.fn();
    (window as unknown as Record<string, unknown>).AudioContext = AC;
    playSound("move");
    playSound("capture");
    playSound("win");
    expect(AC).not.toHaveBeenCalled();
  });
});

describe("SoundToggle", () => {
  it("defaults on, toggles localStorage + silence + aria-pressed", () => {
    render(<SoundToggle />);
    const btn = screen.getByTestId("sound-toggle");
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(isSoundEnabled()).toBe(true);

    fireEvent.click(btn);
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(localStorage.getItem(SOUND_STORAGE_KEY)).toBe("0");
    expect(isSoundEnabled()).toBe(false);

    fireEvent.click(btn);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem(SOUND_STORAGE_KEY)).toBe("1");
  });
});
