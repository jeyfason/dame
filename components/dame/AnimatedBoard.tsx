"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Crown } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import type { GameState } from "@/lib/rules/types";

/** Dame motion token: piece slide duration (150–250ms band). */
export const ANIMATION_DURATION_MS = 180;
const DURATION_S = ANIMATION_DURATION_MS / 1000;

export interface BoardSquare {
  r: number;
  c: number;
}

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
  /** From/to of the latest move — quiet brass trail until the next move. */
  lastMove?: { from: [number, number]; to: [number, number] } | null;
  /** Square the landing piece slides in from (enter animation). */
  slideFrom?: [number, number] | null;
  /** Squares whose pieces pulse brass while a capture is mandatory. */
  mustCaptureIds?: ReadonlySet<string>;
  /** Destinations that capture — stronger ring instead of a dot. */
  captureDestIds?: ReadonlySet<string>;
  /** Invalid-tap target: shake + terracotta flash, no text popup. */
  shakeSquare?: [number, number] | null;
  /** Promotion celebration: expanding brass ring + crown. */
  burstSquare?: [number, number] | null;
  /** Color that can move now — its pieces hover-lift. */
  liftColor?: "white" | "black" | null;
  /** Not your turn / board is spectated: gentle dimming. */
  dimmed?: boolean;
  /** Demo boards: no pointer events, hidden from a11y tree. */
  interactive?: boolean;
  /** Buttons rendered inside the end overlay under the result. */
  overlayActions?: ReactNode;
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

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

export function AnimatedBoard({
  state,
  selected,
  destIds,
  onSquare,
  reducedMotion,
  boardLabel = "Checkers board",
  showWinnerBanner = true,
  announcement,
  lastMove,
  slideFrom,
  mustCaptureIds,
  captureDestIds,
  shakeSquare,
  burstSquare,
  liftColor,
  dimmed,
  interactive = true,
  overlayActions,
}: AnimatedBoardProps) {
  const systemReduced = useReducedMotion();
  const reduced = reducedMotion ?? systemReduced ?? false;
  const transition = reduced ? { duration: 0 } : { duration: DURATION_S, ease: "easeOut" as const };

  const hasDest = (r: number, c: number) => (destIds as ReadonlySet<string>).has(`${r},${c}`);
  const isCaptureDest = (r: number, c: number) =>
    (captureDestIds as ReadonlySet<string> | undefined)?.has(`${r},${c}`) ?? false;
  const onTrail = (r: number, c: number) =>
    lastMove !== undefined &&
    lastMove !== null &&
    ((lastMove.from[0] === r && lastMove.from[1] === c) ||
      (lastMove.to[0] === r && lastMove.to[1] === c));

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
    <div className="dame-board-scene grid w-full min-w-0 gap-4">
      <p data-testid="move-announcement" aria-live="polite" role="status" className="sr-only">
        {announcement ?? ""}
      </p>
      <div
        className={`dame-board-frame w-full max-w-[600px] p-2.5 sm:p-3 ${
          interactive ? "" : "select-none"
        } ${dimmed ? "dame-dimmed" : ""}`}
        aria-hidden={interactive ? undefined : true}
        style={
          interactive
            ? undefined
            : ({ pointerEvents: "none" } as const)
        }
      >
        {/* Ranks column (1–10, bottom-up) */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gridTemplateRows: "1fr auto", gap: "2px 4px" }}>
          <div aria-hidden="true" className="flex flex-col pr-0.5">
            {Array.from({ length: 10 }).map((_, i) => (
              <span
                key={i}
                className="flex flex-1 items-center justify-end font-sans text-[10px] font-medium tracking-widest"
                style={{ color: "var(--dame-frame-text)", opacity: 0.75 }}
              >
                {10 - i}
              </span>
            ))}
          </div>
          <div className="relative">
            <div
              data-testid="board"
              aria-label={boardLabel}
              role={interactive ? undefined : "presentation"}
              className="grid aspect-square w-full grid-cols-10 overflow-hidden rounded-[10px] shadow-[inset_0_2px_8px_rgba(0,0,0,0.55),inset_0_0_0_1px_rgba(0,0,0,0.35)]"
            >
              {Array.from({ length: 100 }).map((_, i) => {
                const r = Math.floor(i / 10);
                const c = i % 10;
                const dark = (r + c) % 2 === 1;
                const piece = state.board[r]?.[c];
                const isSelected = selected !== null && selected[0] === r && selected[1] === c;
                const isDest = hasDest(r, c);
                const capDest = isCaptureDest(r, c);
                const mustCapture = (mustCaptureIds as ReadonlySet<string> | undefined)?.has(`${r},${c}`) ?? false;
                const shake = shakeSquare !== null && shakeSquare !== undefined && shakeSquare[0] === r && shakeSquare[1] === c;
                const liftable =
                  interactive && piece !== null && piece !== undefined &&
                  liftColor === piece.color && !state.winner;
                // Slide-in offset: from the move's origin square, in own-size units.
                const landing =
                  !reduced && slideFrom && slideFrom[0] === r && slideFrom[1] === c;
                const dx = landing ? (slideFrom![1] - c) * 100 : 0;
                const dy = landing ? (slideFrom![0] - r) * 100 : 0;
                return (
                  <button
                    key={i}
                    type="button"
                    data-testid={`square-${r}-${c}`}
                    aria-label={squareLabel(r, c, piece, { selected: isSelected, dest: isDest })}
                    onClick={() => onSquare(r, c)}
                    onKeyDown={(e) => handleSquareKey(e, r, c)}
                    tabIndex={interactive ? undefined : -1}
                    className={`relative flex aspect-square min-h-0 w-full min-w-0 touch-manipulation items-center justify-center focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--dame-accent)] ${
                      interactive ? "cursor-pointer" : "cursor-default"
                    } ${dark ? "dame-square-dark" : "dame-square-light"} ${
                      onTrail(r, c) ? "dame-trail" : ""
                    } ${shake ? "dame-shake dame-flash" : ""}`}
                    style={
                      isSelected
                        ? { boxShadow: "inset 0 0 0 3px var(--dame-accent)" }
                        : undefined
                    }
                  >
                    <AnimatePresence initial={false}>
                      {piece ? (
                        <motion.span
                          key={`${piece.color}-${piece.kind}`}
                          data-testid={`piece-${r}-${c}`}
                          data-motion="slide"
                          data-reduced-motion={reduced ? "true" : "false"}
                          aria-hidden="true"
                          className="flex h-[76%] w-[76%] items-center justify-center"
                          initial={landing ? { x: `${dx}%`, y: `${dy}%`, opacity: 0.85 } : false}
                          animate={{ x: 0, y: 0, opacity: 1, scale: isSelected ? 1.06 : 1 }}
                          exit={reduced ? undefined : { opacity: 0, scale: 1.25 }}
                          transition={transition}
                        >
                          <span
                            className={`dame-piece ${liftable ? "dame-liftable" : ""} ${
                              isSelected ? "dame-selected" : ""
                            } ${mustCapture && !isSelected ? "dame-pulse" : ""} ${
                              piece.color === "white" ? "dame-piece-white" : "dame-piece-black"
                            } flex h-full w-full items-center justify-center`}
                          >
                            {piece.kind === "king" ? (
                              <Crown
                                className="h-[42%] w-[42%]"
                                style={{
                                  color: "var(--dame-accent)",
                                  fill: "var(--dame-accent)",
                                  filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.4))",
                                }}
                              />
                            ) : null}
                          </span>
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
                          className={capDest ? "dame-dest-ring h-[62%] w-[62%]" : "dame-dest-dot h-[30%] w-[30%]"}
                        />
                      ) : null}
                    </AnimatePresence>
                  </button>
                );
              })}
            </div>
            {/* Wood-grain texture over the squares */}
            <div aria-hidden="true" className="dame-grain absolute inset-0 rounded-[10px]" />
            {/* Promotion burst: expanding brass ring + crown fade-in */}
            <AnimatePresence>
              {burstSquare ? (
                <motion.div
                  key="burst"
                  aria-hidden="true"
                  className="pointer-events-none absolute flex items-center justify-center"
                  style={{
                    left: `${burstSquare[1] * 10}%`,
                    top: `${burstSquare[0] * 10}%`,
                    width: "10%",
                    height: "10%",
                  }}
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0 : 0.35 }}
                >
                  <span className="dame-burst absolute inset-[8%] rounded-full" />
                  <Crown
                    className="relative h-[55%] w-[55%]"
                    style={{ color: "var(--dame-accent-hi)", fill: "var(--dame-accent-hi)" }}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
            {/* End overlay: dimmed board, large result, optional actions */}
            <AnimatePresence initial={false}>
              {state.winner && showWinnerBanner ? (
                <motion.div
                  key="winner"
                  data-testid="winner-banner"
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduced ? undefined : { opacity: 0 }}
                  transition={{ duration: reduced ? 0 : 0.22 }}
                  className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-[10px] bg-[rgba(14,18,12,0.72)] px-6 text-center backdrop-blur-[2px]"
                  role="status"
                >
                  <span className="font-heading text-4xl font-semibold tracking-tight text-[var(--dame-text)] sm:text-5xl">
                    {state.winner === "white" ? "White wins" : "Black wins"}
                  </span>
                  {overlayActions ? (
                    <div className="flex flex-wrap items-center justify-center gap-3">{overlayActions}</div>
                  ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
          {/* Empty corner cell of the frame grid */}
          <div />
          <div aria-hidden="true" className="flex pt-0.5">
            {FILES.map((f) => (
              <span
                key={f}
                className="flex-1 text-center font-sans text-[10px] font-medium tracking-widest"
                style={{ color: "var(--dame-frame-text)", opacity: 0.75 }}
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
