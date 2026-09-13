"use client";

import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { applyMove, initialBoard, legalMoves } from "@/lib/rules/international";
import type { GameState } from "@/lib/rules/types";
import { AnimatedBoard } from "./AnimatedBoard";

/** A short scripted 4-move sequence with a capture, for the landing hero. */
const STEPS: [number, number, number, number][] = [
  [6, 1, 5, 2], // white quiet step
  [3, 0, 4, 1], // black quiet step
  [5, 2, 3, 0], // white captures over (4,1)
  [3, 2, 4, 3], // black quiet step
];

const STEP_MS = 1150;
const HOLD_TICKS = 2; // extra ticks on the final position before looping

interface Frame {
  state: GameState;
  from: [number, number];
  to: [number, number];
}

function buildFrames(): Frame[] {
  const frames: Frame[] = [];
  let cur = initialBoard();
  for (const [fr, fc, tr, tc] of STEPS) {
    const move = legalMoves(cur).find(
      (m) => m.from[0] === fr && m.from[1] === fc && m.to[0] === tr && m.to[1] === tc,
    );
    if (!move) break;
    cur = applyMove(cur, move);
    frames.push({ state: cur, from: [fr, fc], to: [tr, tc] });
  }
  return frames;
}

/**
 * Real board component at small size, auto-looping a scripted
 * 4-move capture sequence. Decorative: non-interactive, aria-hidden.
 */
export function MiniDemoBoard() {
  const reduced = useReducedMotion() ?? false;
  const frames = useMemo(() => buildFrames(), []);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (reduced || frames.length === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), STEP_MS);
    return () => clearInterval(id);
  }, [reduced, frames.length]);

  const total = frames.length + HOLD_TICKS;
  const idx = Math.min(tick % total, frames.length - 1);
  const frame = frames[idx];
  if (!frame) return null;

  return (
    <AnimatedBoard
      state={frame.state}
      selected={null}
      destIds={new Set<string>()}
      onSquare={() => {}}
      reducedMotion={reduced || undefined}
      interactive={false}
      boardLabel="Checkers board demo"
      announcement=""
      lastMove={{ from: frame.from, to: frame.to }}
      slideFrom={tick === 0 ? null : frame.from}
    />
  );
}
