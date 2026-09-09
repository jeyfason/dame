"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { KeyboardEvent } from "react";
import type { GameState } from "@/lib/rules/types";

/** Dame motion token: piece slide duration (150–250ms band). */
export const ANIMATION_DURATION_MS = 180;
const DURATION_S = ANIMATION_DURATION_MS / 1000;

interface AnimatedBoardProps {
  state: GameState;
  selected: [number, number] | null;
  destIds: Set<string> | ReadonlySet<string>;
  onSquare: (r: number, c: number) => void;
  /** Test/override hook — defaults to useReducedMotion(). */
  reducedMotion?: boolean;
  boardLabel?: string;
  /** Realtime page keeps its own winner banner with rematch actions. */
  showWinnerBanner?: boolean;
  /** Polite move/selection announcement for screen readers. */
  announcement?: string | null;
}

/** Human-readable square label: color + kind + coordinates (Stage 6 a11y). */
export function squareLabel(
  r: number,
  c: number,
  piece: { color: string; kind: string } | null | undefined,
  opts?: { selected?: boolean; dest?: boolean },
): string {
  const where = `at row ${r} column ${c}`;
  const base = piece
    ? `${piece.color === "white" ? "White" : "Black"} ${piece.kind} ${where}`
    : `Empty ${((r + c) % 2 === 1 ? "dark" : "light")} square ${where}`;
  const tags = [
    opts?.selected ? "selected" : "",
    opts?.dest ? "destination" : "",
  ].filter(Boolean);
  return tags.length > 0 ? `${base}, ${tags.join(", ")}` : base;
}

function clampFocus(r: number, c: number): [number, number] {
  return [Math.min(9, Math.max(0, r)), Math.min(9, Math.max(0, c))];
}

export function AnimatedBoard({
  state,
  selected,
  destIds,
  onSquare,
  reducedMotion,
  boardLabel = "Checkers board",
  showWinnerBanner = true,
  announcement,
}: AnimatedBoardProps) {
  const systemReduced = useReducedMotion();
  const reduced = reducedMotion ?? systemReduced ?? false;
  const transition = reduced ? { duration: 0 } : { duration: DURATION_S, ease: "easeOut" as const };

  const hasDest = (r: number, c: number) => (destIds as Set<string>).has(`${r},${c}`);

  // Full keyboard play: arrows move DOM focus between squares (clamped at
  // the edges); Enter/Space activate the focused button natively (click).
  function handleSquareKey(e: KeyboardEvent<HTMLButtonElement>, r: number, c: number) {
    const deltas: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const d = deltas[e.key];
    if (!d) return;
    e.preventDefault();
    const [nr, nc] = clampFocus(r + d[0], c + d[1]);
    document
      .querySelector<HTMLElement>(`[data-testid="square-${nr}-${nc}"]`)
      ?.focus();
  }

  return (
    <div className="grid min-w-0 gap-4">
      <p data-testid="move-announcement" aria-live="polite" role="status" className="sr-only">
        {announcement ?? ""}
      </p>
      <AnimatePresence initial={false}>
        {state.winner && showWinnerBanner ? (
          <motion.div
            key="winner"
            data-testid="winner-banner"
            initial={reduced ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -6 }}
            transition={transition}
            className="flex items-center justify-between rounded-[var(--dame-radius)] border border-white/10 px-4 py-3"
            style={{ background: "var(--dame-felt-deep)" }}
          >
            <span className="font-bold">
              {state.winner === "white" ? "White" : "Black"} wins!
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div
        data-testid="board"
        aria-label={boardLabel}
        className="grid aspect-square w-full max-w-[560px] min-w-0 grid-cols-10 overflow-hidden rounded-[var(--dame-radius)] border border-white/10"
        style={{ background: "var(--dame-felt)" }}
      >
        {Array.from({ length: 100 }).map((_, i) => {
          const r = Math.floor(i / 10);
          const c = i % 10;
          const dark = (r + c) % 2 === 1;
          const piece = state.board[r]?.[c];
          const isSelected = selected !== null && selected[0] === r && selected[1] === c;
          const isDest = hasDest(r, c);
          return (
            <button
              key={i}
              type="button"
              data-testid={`square-${r}-${c}`}
              aria-label={squareLabel(r, c, piece, { selected: isSelected, dest: isDest })}
              onClick={() => onSquare(r, c)}
              onKeyDown={(e) => handleSquareKey(e, r, c)}
              className={`flex aspect-square min-h-0 w-full min-w-0 cursor-pointer touch-manipulation items-center justify-center focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--dame-gold)] ${
                dark ? "bg-black/30" : "bg-white/10"
              }`}
              style={isSelected ? { boxShadow: "inset 0 0 0 3px var(--dame-gold)" } : undefined}
            >
              <AnimatePresence initial={false}>
                {piece ? (
                  <motion.span
                    key={`${piece.color}-${piece.kind}`}
                    data-testid={`piece-${r}-${c}`}
                    data-motion="slide"
                    data-reduced-motion={reduced ? "true" : "false"}
                    aria-hidden="true"
                    layout={reduced ? false : true}
                    initial={false}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={reduced ? undefined : { opacity: 0, scale: 0.4 }}
                    transition={transition}
                    className={`flex h-[70%] w-[70%] items-center justify-center rounded-full ${
                      piece.color === "white" ? "" : "border-2 border-white/40"
                    }`}
                    style={{
                      background:
                        piece.color === "white" ? "var(--dame-ivory)" : "var(--dame-ebony)",
                    }}
                  >
                    {piece.kind === "king" ? (
                      <span
                        aria-hidden="true"
                        className="h-1/3 w-1/3 rounded-full"
                        style={{ background: "var(--dame-gold)" }}
                      />
                    ) : null}
                  </motion.span>
                ) : isDest ? (
                  <motion.span
                    key="dest"
                    data-testid={`dest-${r}-${c}`}
                    aria-hidden="true"
                    initial={reduced ? false : { scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={reduced ? undefined : { scale: 0.4, opacity: 0 }}
                    transition={transition}
                    className="h-1/3 w-1/3 rounded-full"
                    style={{ background: "var(--dame-teal)" }}
                  />
                ) : null}
              </AnimatePresence>
            </button>
          );
        })}
      </div>
    </div>
  );
}
