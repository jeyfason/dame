"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { applyMove, initialBoard, legalMoves } from "@/lib/rules/international";
import type { GameState } from "@/lib/rules/types";

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
        setState(applyMove(state, dest));
        setSelected(null);
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
      {state.winner ? (
        <div
          data-testid="winner-banner"
          className="flex items-center justify-between rounded-[var(--dame-radius)] border border-white/10 px-4 py-3"
          style={{ background: "var(--dame-felt-deep)" }}
        >
          <span className="font-bold">
            {state.winner === "white" ? "White" : "Black"} wins!
          </span>
        </div>
      ) : null}
      <div
        data-testid="board"
        aria-label="Local 2-player checkers board"
        className="grid aspect-square w-full max-w-[560px] grid-cols-10 overflow-hidden rounded-[var(--dame-radius)] border border-white/10"
        style={{ background: "var(--dame-felt)" }}
      >
        {Array.from({ length: 100 }).map((_, i) => {
          const r = Math.floor(i / 10);
          const c = i % 10;
          const dark = (r + c) % 2 === 1;
          const piece = state.board[r][c];
          const isSelected = selected !== null && selected[0] === r && selected[1] === c;
          const isDest = destIds.has(`${r},${c}`);
          return (
            <button
              key={i}
              type="button"
              data-testid={`square-${r}-${c}`}
              aria-label={`square ${r} ${c}${piece ? ` ${piece.color} ${piece.kind}` : ""}${isDest ? " destination" : ""}`}
              onClick={() => handleSquare(r, c)}
              className={`flex min-h-[44px] min-w-[44px] items-center justify-center ${
                dark ? "bg-black/30" : "bg-white/10"
              }`}
              style={isSelected ? { boxShadow: "inset 0 0 0 3px var(--dame-gold)" } : undefined}
            >
              {piece ? (
                <span
                  data-testid={`piece-${r}-${c}`}
                  aria-hidden="true"
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
                </span>
              ) : isDest ? (
                <span
                  data-testid={`dest-${r}-${c}`}
                  aria-hidden="true"
                  className="h-1/3 w-1/3 rounded-full"
                  style={{ background: "var(--dame-teal)" }}
                />
              ) : null}
            </button>
          );
        })}
      </div>
      <div>
        <button
          type="button"
          data-testid="reset-button"
          onClick={reset}
          className="min-h-[44px] rounded-[var(--dame-radius)] border border-white/20 px-5 py-3 font-semibold"
        >
          Reset game
        </button>
      </div>
    </div>
  );
}
