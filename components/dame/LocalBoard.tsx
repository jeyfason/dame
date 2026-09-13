"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { applyMove, initialBoard, legalMoves } from "@/lib/rules/international";
import type { GameState } from "@/lib/rules/types";
import { AnimatedBoard } from "./AnimatedBoard";
import { PlayerPlaque } from "./PlayerPlaque";
import { SoundToggle } from "./SoundToggle";
import { PieceStylePicker } from "./PieceStylePicker";
import { playCapture, playInvalid, playMove, playMultiCapture, playWin } from "@/lib/sound";

const SHAKE_MS = 320;
const PULSE_MS = 1000;
const BURST_MS = 950;
const SLIDE_MS = 220;

function countColor(state: GameState, color: "white" | "black"): number {
  let n = 0;
  for (const row of state.board) {
    for (const sq of row) {
      if (sq && sq.color === color) n++;
    }
  }
  return n;
}

/** Color name of a piece count — captured discs shown on the plaque. */
function capturedBy(state: GameState, color: "white" | "black"): number {
  return 20 - countColor(state, color === "white" ? "black" : "white");
}

/**
 * Local pass-and-play board. All feedback is physical and in-board:
 * shake/flash on invalid taps, brass pulse when a capture is mandatory,
 * crown burst on promotion. No toasts during gameplay (spec 2026-09-09 §2).
 */
export function LocalBoard() {
  const [state, setState] = useState<GameState>(() => initialBoard());
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [announcement, setAnnouncement] = useState<string>("White to move");
  const [lastMove, setLastMove] = useState<{ from: [number, number]; to: [number, number] } | null>(null);
  const [slideFrom, setSlideFrom] = useState<[number, number] | null>(null);
  const [shakeSquare, setShakeSquare] = useState<[number, number] | null>(null);
  const [pulseIds, setPulseIds] = useState<Set<string> | null>(null);
  const [burstSquare, setBurstSquare] = useState<[number, number] | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  function after(ms: number, fn: () => void): void {
    timers.current.push(setTimeout(fn, ms));
  }
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) clearTimeout(t);
    };
  }, []);

  function clearTransient(): void {
    setShakeSquare(null);
    setPulseIds(null);
  }

  function reset() {
    setState(initialBoard());
    setSelected(null);
    setAnnouncement("White to move");
    setLastMove(null);
    setSlideFrom(null);
    setBurstSquare(null);
    clearTransient();
  }

  const moves = useMemo(() => legalMoves(state), [state]);
  const capturesMandatory = useMemo(
    () => moves.some((m) => m.captures.length > 0),
    [moves],
  );
  const selectedMoves = useMemo(
    () =>
      selected
        ? moves.filter((m) => m.from[0] === selected[0] && m.from[1] === selected[1])
        : [],
    [moves, selected],
  );
  const destIds = useMemo(
    () => new Set(selectedMoves.map((m) => `${m.to[0]},${m.to[1]}`)),
    [selectedMoves],
  );
  const captureDestIds = useMemo(
    () => new Set(selectedMoves.filter((m) => m.captures.length > 0).map((m) => `${m.to[0]},${m.to[1]}`)),
    [selectedMoves],
  );

  function handleSquare(r: number, c: number) {
    if (state.winner) return;
    const dest = selectedMoves.find((m) => m.to[0] === r && m.to[1] === c);
    if (selected && dest) {
      const next = applyMove(state, dest);
      setState(next);
      setSelected(null);
      setLastMove({ from: dest.from, to: dest.to });
      setSlideFrom(dest.from);
      if (dest.promotes) {
        setBurstSquare(dest.to);
        after(BURST_MS, () => setBurstSquare(null));
      }
      after(SLIDE_MS, () => setSlideFrom(null));
      clearTransient();
      const mover = state.turn === "white" ? "White" : "Black";
      const after_ = next.winner
        ? `${next.winner === "white" ? "White" : "Black"} wins`
        : `${next.turn === "white" ? "White" : "Black"} to move`;
      const capture =
        dest.captures.length > 0 ? ` capturing ${dest.captures.length}` : "";
      setAnnouncement(
        `${mover} moved from row ${dest.from[0]} column ${dest.from[1]} to row ${dest.to[0]} column ${dest.to[1]}${capture} — ${after_}`,
      );
      if (next.winner) playWin();
      else if (dest.captures.length > 1) playMultiCapture();
      else if (dest.captures.length > 0) playCapture();
      else playMove();
      return;
    }
    const piece = state.board[r][c];
    if (piece && piece.color === state.turn) {
      const pieceMoves = moves.filter((m) => m.from[0] === r && m.from[1] === c);
      if (pieceMoves.length === 0) {
        setSelected(null);
        playInvalid();
        if (capturesMandatory) {
          // Teach the majority-capture rule instead of scolding: the pieces
          // that must capture pulse brass.
          setPulseIds(new Set(moves.map((m) => `${m.from[0]},${m.from[1]}`)));
          after(PULSE_MS, () => setPulseIds(null));
          setAnnouncement(
            `A capture is mandatory. ${state.turn === "white" ? "White" : "Black"} piece at row ${r} column ${c} cannot move; the pulsing pieces must capture.`,
          );
        } else {
          setShakeSquare([r, c]);
          after(SHAKE_MS, () => setShakeSquare(null));
          setAnnouncement("Illegal move");
        }
      } else {
        setSelected([r, c]);
        clearTransient();
        const name = state.turn === "white" ? "White" : "Black";
        setAnnouncement(`${name} ${piece.kind} selected at row ${r} column ${c}`);
      }
      return;
    }
    // Invalid target: empty square or opponent piece — shake, flash, thud.
    playInvalid();
    setShakeSquare([r, c]);
    after(SHAKE_MS, () => setShakeSquare(null));
    setAnnouncement("Illegal move");
  }

  const turnName = state.turn === "white" ? "White" : "Black";

  return (
    <div className="grid w-full min-w-0 justify-items-center gap-3">
      <PlayerPlaque
        name="Black"
        color="black"
        captured={capturedBy(state, "black")}
        active={!state.winner && state.turn === "black"}
      />
      <div className="grid w-full min-w-0 justify-items-center gap-2">
        <p data-testid="turn-label" className="text-sm font-medium text-[var(--dame-muted)]">
          {state.winner
            ? `${state.winner === "white" ? "White" : "Black"} wins`
            : `${turnName} to move`}
        </p>
        <AnimatedBoard
          state={state}
          selected={selected}
          destIds={destIds}
          captureDestIds={captureDestIds}
          onSquare={handleSquare}
          boardLabel="Local 2-player checkers board"
          announcement={announcement}
          lastMove={lastMove}
          slideFrom={slideFrom}
          mustCaptureIds={pulseIds ?? undefined}
          shakeSquare={shakeSquare}
          burstSquare={burstSquare}
          liftColor={state.winner ? null : state.turn}
          overlayActions={
            <button
              type="button"
              data-testid="reset-button"
              onClick={reset}
              className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[var(--dame-radius)] px-5 py-3 font-semibold text-[var(--dame-accent-ink)] shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-transform duration-150 hover:scale-[1.03]"
              style={{ background: "var(--dame-accent)" }}
            >
              <RotateCcw size={16} /> Play again
            </button>
          }
        />
      </div>
      <PlayerPlaque
        name="White"
        color="white"
        captured={capturedBy(state, "white")}
        active={!state.winner && state.turn === "white"}
      />
      <div className="flex flex-wrap items-center justify-center gap-3">
        {/* Overlay owns the reset action once the game is over — exactly one
            reset-button testid exists at any time (E2E strict mode). */}
        {!state.winner ? (
          <button
            type="button"
            data-testid="reset-button"
            onClick={reset}
            className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[var(--dame-radius)] border border-[rgba(242,237,227,0.14)] bg-[var(--dame-surface-deep)] px-5 py-2.5 font-semibold transition-colors duration-150 hover:border-[rgba(201,162,39,0.4)]"
          >
            <RotateCcw size={16} /> Reset game
          </button>
        ) : null}
        <PieceStylePicker />
        <SoundToggle />
      </div>
    </div>
  );
}
