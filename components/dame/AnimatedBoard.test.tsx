// @vitest-environment jsdom
import { describe, it, expect } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { render, screen } from "@testing-library/react";
import { initialBoard } from "@/lib/rules/international";
import { AnimatedBoard, ANIMATION_DURATION_MS } from "./AnimatedBoard";

describe("AnimatedBoard", () => {
  it("renders 100 squares with pieces (move-anim surface)", () => {
    const state = initialBoard();
    const { container, unmount } = render(
      <AnimatedBoard
        state={state}
        selected={null}
        destIds={new Set<string>()}
        onSquare={() => {}}
      />,
    );
    expect(screen.getByTestId("board")).toBeTruthy();
    expect(container.querySelectorAll('[data-testid^="square-"]').length).toBe(100);
    // Pieces slide: each rendered piece is a motion element with layout anim marker.
    const pieces = container.querySelectorAll('[data-testid^="piece-"]');
    expect(pieces.length).toBeGreaterThan(0);
    for (const p of Array.from(pieces)) {
      expect(p.getAttribute("data-motion")).toBe("slide");
    }
    unmount();
  });

  it("honors reduced motion: instant, no animate", () => {
    const state = initialBoard();
    const { container, unmount } = render(
      <AnimatedBoard
        state={state}
        selected={null}
        destIds={new Set<string>()}
        onSquare={() => {}}
        reducedMotion
      />,
    );
    const pieces = container.querySelectorAll('[data-testid^="piece-"]');
    expect(pieces.length).toBeGreaterThan(0);
    for (const p of Array.from(pieces)) {
      expect(p.getAttribute("data-reduced-motion")).toBe("true");
    }
    expect(ANIMATION_DURATION_MS).toBeGreaterThanOrEqual(150);
    expect(ANIMATION_DURATION_MS).toBeLessThanOrEqual(250);
    unmount();
  });

  it("shows winner banner via AnimatePresence surface", () => {
    const state = { ...initialBoard(), winner: "white" as const };
    render(
      <AnimatedBoard
        state={state}
        selected={null}
        destIds={new Set<string>()}
        onSquare={() => {}}
      />,
    );
    expect(screen.getByTestId("winner-banner")).toBeTruthy();
  });
});
