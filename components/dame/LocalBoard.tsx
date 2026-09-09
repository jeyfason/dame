"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { applyMove, initialBoard, legalMoves } from "@/lib/rules/international";
import type { GameState } from "@/lib/rules/types";
import { AnimatedBoard } from "./AnimatedBoard";
import { SoundToggle } from "./SoundToggle";
import { playCapture, playMove, playWin } from "@/lib/sound";

export function LocalBoard() {
  const [state, setState] = useState<GameState>(() => initialBoard());
  const [selected, setSelected] = useState<[number, number] | null>(null);

  const moves = useMemo(() => legalMoves(state), [state]);
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

  function reset() {
    setState(initialBoard());
    setSelected(null);
  }

  function handleSquare(r: number, c: number) {
    if (state.winner) return;
    const dest = selectedMoves.find((m) => m.to[0] === r && m.to[1] === c);
    if (selected && dest) {
      try {
        const next = applyMove(state, dest);
        setState(next);
        setSelected(null);
        if (next.winner) playWin();
        else if (dest.captures.length > 0) playCapture();
        else playMove();
      } catch {
        toast.error("Illegal move");
      }
      return;
    }
    const piece = state.board[r][c];
    if (piece && piece.color === state.turn) {
      const pieceMoves = moves.filter((m) => m.from[0] === r && m.from[1] === c);
      if (pieceMoves.length === 0) {
        setSelected(null);
        toast.error("Illegal move — that piece has no legal moves");
      } else {
        setSelected([r, c]);
      }
      return;
    }
    toast.error("Illegal move");
  }

  const turnName = state.turn === "white" ? "White" : "Black";

  return (
    <div className="grid gap-4">
      <p data-testid="turn-label" className="text-sm font-semibold">
        {state.winner ? `${state.winner === "white" ? "White" : "Black"} wins` : `${turnName} to move`}
      </p>
      <AnimatedBoard
        state={state}
        selected={selected}
        destIds={destIds}
        onSquare={handleSquare}
        boardLabel="Local 2-player checkers board"
      />
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          data-testid="reset-button"
          onClick={reset}
          className="min-h-[44px] cursor-pointer rounded-[var(--dame-radius)] border border-white/20 px-5 py-3 font-semibold transition-colors duration-200"
        >
          Reset game
        </button>
        <SoundToggle />
      </div>
    </div>
  );
}
