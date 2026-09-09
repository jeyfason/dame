// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { render, screen, fireEvent } from "@testing-library/react";
import { VoiceBar } from "./VoiceBar";

describe("VoiceBar", () => {
  it("renders disabled state with a disabled join control when voice is off", () => {
    render(<VoiceBar enabled={false} />);
    expect(screen.getByTestId("voice-bar")).toHaveProperty(
      "dataset.state",
      "disabled",
    );
    expect(screen.getByTestId("voice-join")).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("mute toggle flips label and aria-pressed, and notifies", () => {
    const onMutedChange = vi.fn();
    render(<VoiceBar enabled onMutedChange={onMutedChange} />);
    const toggle = screen.getByTestId("voice-mute-toggle");
    expect(toggle.textContent).toMatch(/mute/i);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.textContent).toMatch(/unmute/i);
    expect(onMutedChange).toHaveBeenCalledWith(false);
  });
});
