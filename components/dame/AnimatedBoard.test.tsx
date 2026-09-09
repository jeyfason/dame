// @vitest-environment jsdom
import { describe, it, expect } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { render, screen, fireEvent } from "@testing-library/react";
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
    const { unmount } = render(
      <AnimatedBoard
        state={state}
        selected={null}
        destIds={new Set<string>()}
        onSquare={() => {}}
      />,
    );
    expect(screen.getByTestId("winner-banner")).toBeTruthy();
    unmount();
  });
});

describe("AnimatedBoard a11y", () => {
  it("labels squares with color, kind and coordinates", () => {
    const state = initialBoard();
    const { unmount } = render(
      <AnimatedBoard
        state={state}
        selected={null}
        destIds={new Set<string>(["5,2"])}
        onSquare={() => {}}
      />,
    );
    expect(screen.getByTestId("square-6-1").getAttribute("aria-label")).toMatch(
      /white.*man.*row 6.*column 1/i,
    );
    expect(screen.getByTestId("square-3-0").getAttribute("aria-label")).toMatch(
      /black.*man.*row 3.*column 0/i,
    );
    expect(screen.getByTestId("square-5-2").getAttribute("aria-label")).toMatch(
      /empty.*row 5.*column 2.*destination/i,
    );
    unmount();
  });

  it("announces moves through a polite live region", () => {
    const state = initialBoard();
    const { unmount } = render(
      <AnimatedBoard
        state={state}
        selected={null}
        destIds={new Set<string>()}
        onSquare={() => {}}
        announcement="White moved from row 6 column 1 to row 5 column 2"
      />,
    );
    const live = screen.getByTestId("move-announcement");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toContain("White moved from row 6 column 1");
    unmount();
  });

  it("arrow keys move focus between squares", () => {
    const state = initialBoard();
    const { container, unmount } = render(
      <AnimatedBoard
        state={state}
        selected={null}
        destIds={new Set<string>()}
        onSquare={() => {}}
      />,
    );
    const q = (id: string) =>
      container.querySelector(`[data-testid="${id}"]`) as HTMLElement;
    q("square-6-1").focus();
    fireEvent.keyDown(q("square-6-1"), { key: "ArrowRight" });
    expect(document.activeElement?.getAttribute("data-testid")).toBe("square-6-2");
    fireEvent.keyDown(q("square-6-2"), { key: "ArrowDown" });
    expect(document.activeElement?.getAttribute("data-testid")).toBe("square-7-2");
    unmount();
  });
});
