"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, RotateCcw } from "lucide-react";
import { applyMove, initialBoard, legalMoves } from "@/lib/rules/international";
import type { GameState } from "@/lib/rules/types";
import { chooseBotMove, type BotLevel } from "@/lib/bot/bot";
import type { Role } from "@/hooks/useGameRoom";
import { AnimatedBoard } from "./AnimatedBoard";
import { PlayerPlaque } from "./PlayerPlaque";
import { SoundToggle } from "./SoundToggle";
import { PieceStylePicker } from "./PieceStylePicker";
import { playCapture, playInvalid, playMove, playMultiCapture, playWin } from "@/lib/sound";

const SHAKE_MS = 320;
const PULSE_MS = 1000;
const BURST_MS = 950;
const SLIDE_MS = 220;
const BOT_THINK_MS = 600;

const LEVELS: { id: BotLevel; label: string }[] = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
];

function countColor(state: GameState, color: Role): number {
  let n = 0;
  for (const row of state.board) {
    for (const sq of row) {
      if (sq && sq.color === color) n++;
    }
  }
  return n;
}

/**
 * Play against the built-in bot (client-side engine, unrated). Same
 * physical in-board feedback as the local board; the bot "thinks" for a
 * beat so its move reads as deliberate.
 */
export function BotBoard() {
  const [state, setState] = useState<GameState>(() => initialBoard());
  const [level, setLevel] = useState<BotLevel>("medium");
  const [playerColor, setPlayerColor] = useState<Role>("white");
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

  const reset = useCallback(
    (color: Role = playerColor) => {
      setState(initialBoard());
      setSelected(null);
      setLastMove(null);
      setSlideFrom(null);
      setBurstSquare(null);
      clearTransient();
      setAnnouncement(color === "white" ? "White to move" : "Black to move — the bot opens.");
    },
    [playerColor],
  );

  const moves = useMemo(() => legalMoves(state), [state]);
  const capturesMandatory = useMemo(() => moves.some((m) => m.captures.length > 0), [moves]);
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
    () =>
      new Set(
        selectedMoves.filter((m) => m.captures.length > 0).map((m) => `${m.to[0]},${m.to[1]}`),
      ),
    [selectedMoves],
  );

  const winner = state.winner;
  const botColor: Role = playerColor === "white" ? "black" : "white";
  const botTurn = !winner && state.turn === botColor;
  // The bot is "thinking" for the whole beat between the player's move and
  // its reply — derived, no extra state needed.
  const thinking = botTurn;

  // The bot replies after a short "thinking" beat.
  useEffect(() => {
    if (!botTurn) return;
    const t = setTimeout(() => {
      const move = chooseBotMove(state, level);
      if (!move) return;
      const next = applyMove(state, move);
      setState(next);
      setLastMove({ from: move.from, to: move.to });
      setSlideFrom(move.from);
      if (move.promotes) {
        setBurstSquare(move.to);
        after(BURST_MS, () => setBurstSquare(null));
      }
      after(SLIDE_MS, () => setSlideFrom(null));
      setSelected(null);
      clearTransient();
      const mover = botColor === "white" ? "White" : "Black";
      const after_ = next.winner
        ? `${next.winner === "white" ? "White" : "Black"} wins`
        : `${next.turn === "white" ? "White" : "Black"} to move`;
      const capture = move.captures.length > 0 ? ` capturing ${move.captures.length}` : "";
      setAnnouncement(
        `${mover} moved from row ${move.from[0]} column ${move.from[1]} to row ${move.to[0]} column ${move.to[1]}${capture} — ${after_}`,
      );
      if (next.winner) playWin();
      else if (move.captures.length > 1) playMultiCapture();
      else if (move.captures.length > 0) playCapture();
      else playMove();
    }, BOT_THINK_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, botTurn, level]);

  function describe(
    dest: { from: [number, number]; to: [number, number]; captures: [number, number][]; promotes: boolean },
    resultNote: string | null,
  ): void {
    const mover = state.turn === "white" ? "White" : "Black";
    setLastMove({ from: dest.from, to: dest.to });
    setSlideFrom(dest.from);
    if (dest.promotes) {
      setBurstSquare(dest.to);
      after(BURST_MS, () => setBurstSquare(null));
    }
    after(SLIDE_MS, () => setSlideFrom(null));
    const after_ = resultNote ?? `${state.turn === "white" ? "Black" : "White"} to move`;
    const capture = dest.captures.length > 0 ? ` capturing ${dest.captures.length}` : "";
    setAnnouncement(
      `${mover} moved from row ${dest.from[0]} column ${dest.from[1]} to row ${dest.to[0]} column ${dest.to[1]}${capture} — ${after_}`,
    );
  }

  function handleSquare(r: number, c: number) {
    if (winner || botTurn) {
      // Bot's turn: gentle shake only, the board is dimmed.
      playInvalid();
      setShakeSquare([r, c]);
      after(SHAKE_MS, () => setShakeSquare(null));
      return;
    }
    const dest = selectedMoves.find((m) => m.to[0] === r && m.to[1] === c);
    if (selected && dest) {
      const next = applyMove(state, dest);
      setState(next);
      setSelected(null);
      clearTransient();
      describe(
        dest,
        next.winner ? `${next.winner === "white" ? "White" : "Black"} wins` : null,
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
          setPulseIds(new Set(moves.map((m) => `${m.from[0]},${m.from[1]}`)));
          after(PULSE_MS, () => setPulseIds(null));
          setAnnouncement(
            `A capture is mandatory. The pulsing pieces must capture — piece at row ${r} column ${c} cannot move.`,
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
    playInvalid();
    setShakeSquare([r, c]);
    after(SHAKE_MS, () => setShakeSquare(null));
    setAnnouncement("Illegal move");
  }

  const turnName = state.turn === "white" ? "White" : "Black";
  const flipped = playerColor === "black";

  return (
    <div className="grid w-full min-w-0 justify-items-center gap-3">
      <div className="flex w-full flex-wrap items-center justify-center gap-2">
        <div
          role="group"
          aria-label="Bot difficulty"
          className="inline-flex rounded-full border border-[rgba(242,237,227,0.14)] bg-[var(--dame-surface-deep)] p-1"
        >
          {LEVELS.map((l) => (
            <button
              key={l.id}
              type="button"
              data-testid={`bot-level-${l.id}`}
              aria-pressed={level === l.id ? "true" : "false"}
              onClick={() => setLevel(l.id)}
              className={`min-h-[36px] cursor-pointer rounded-full px-3.5 text-sm font-medium transition-colors duration-150 ${
                level === l.id
                  ? "bg-[rgba(201,162,39,0.16)] text-[var(--dame-accent-hi)]"
                  : "text-[var(--dame-muted)] hover:text-[var(--dame-text)]"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div
          role="group"
          aria-label="Your color"
          className="inline-flex rounded-full border border-[rgba(242,237,227,0.14)] bg-[var(--dame-surface-deep)] p-1"
        >
          {(["white", "black"] as Role[]).map((col) => (
            <button
              key={col}
              type="button"
              data-testid={`bot-color-${col}`}
              aria-pressed={playerColor === col ? "true" : "false"}
              onClick={() => {
                setPlayerColor(col);
                reset(col);
              }}
              className={`min-h-[36px] cursor-pointer rounded-full px-3.5 text-sm font-medium capitalize transition-colors duration-150 ${
                playerColor === col
                  ? "bg-[rgba(201,162,39,0.16)] text-[var(--dame-accent-hi)]"
                  : "text-[var(--dame-muted)] hover:text-[var(--dame-text)]"
              }`}
            >
              Play {col}
            </button>
          ))}
        </div>
      </div>

      <PlayerPlaque
        name="Dame Bot"
        color={botColor}
        captured={20 - countColor(state, playerColor)}
        active={botTurn}
        note={thinking ? "Thinking…" : `Level: ${level}`}
      />
      <div className="grid w-full min-w-0 justify-items-center gap-2">
        <p data-testid="turn-label" className="text-sm font-medium text-[var(--dame-muted)]">
          {winner
            ? `${winner === "white" ? "White" : "Black"} wins`
            : thinking
              ? `${turnName} is thinking…`
              : `${turnName} to move`}
        </p>
        <div className="relative w-full">
          <div
            style={{
              transform: flipped ? "rotate(180deg)" : undefined,
              transition: "transform 300ms ease",
            }}
          >
            <AnimatedBoard
              state={state}
              selected={selected}
              destIds={destIds}
              captureDestIds={captureDestIds}
              onSquare={handleSquare}
              boardLabel="Bot checkers board"
              announcement={announcement}
              lastMove={lastMove}
              slideFrom={slideFrom}
              mustCaptureIds={pulseIds ?? undefined}
              shakeSquare={shakeSquare}
              burstSquare={burstSquare}
              liftColor={botTurn || winner ? null : state.turn}
              dimmed={botTurn && !winner}
              overlayActions={
                <button
                  type="button"
                  data-testid="reset-button"
                  onClick={() => reset()}
                  className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[var(--dame-radius)] px-5 py-3 font-semibold text-[var(--dame-accent-ink)] shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-transform duration-150 hover:scale-[1.03]"
                  style={{ background: "var(--dame-accent)" }}
                >
                  <RotateCcw size={16} /> Play again
                </button>
              }
            />
          </div>
        </div>
      </div>
      <PlayerPlaque
        name="You"
        color={playerColor}
        captured={20 - countColor(state, botColor)}
        active={!winner && !botTurn}
        note={`Playing ${playerColor}`}
      />
      <div className="flex flex-wrap items-center justify-center gap-3">
        {!winner ? (
          <button
            type="button"
            data-testid="reset-button"
            onClick={() => reset()}
            className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[var(--dame-radius)] border border-[rgba(242,237,227,0.14)] bg-[var(--dame-surface-deep)] px-5 py-2.5 font-semibold transition-colors duration-150 hover:border-[rgba(201,162,39,0.4)]"
          >
            <RotateCcw size={16} /> New game
          </button>
        ) : null}
        <PieceStylePicker />
        <SoundToggle />
      </div>
      <p className="flex items-center gap-1.5 text-xs text-[var(--dame-muted)]">
        <Bot size={14} aria-hidden="true" />
        Unrated — the bot plays on your device, no account needed.
      </p>
    </div>
  );
}
