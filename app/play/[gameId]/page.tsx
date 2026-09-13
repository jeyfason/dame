"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { RotateCcw, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { legalMoves, applyMove } from "@/lib/rules/international";
import type { GameState } from "@/lib/rules/types";
import { playCapture, playInvalid, playMove, playMultiCapture, playWin } from "@/lib/sound";
import { useGameRoom, type Role } from "@/hooks/useGameRoom";
import { AnimatedBoard } from "@/components/dame/AnimatedBoard";
import { PlayerPlaque } from "@/components/dame/PlayerPlaque";
import { SoundToggle } from "@/components/dame/SoundToggle";
import { PieceStylePicker } from "@/components/dame/PieceStylePicker";
import { ChatPanel } from "@/components/dame/ChatPanel";
import { VoiceBar } from "@/components/dame/VoiceBar";
import { Toaster } from "@/components/ui/sonner";

const SHAKE_MS = 320;
const PULSE_MS = 1000;
const BURST_MS = 950;

function isRole(v: string | null): v is Role {
  return v === "white" || v === "black";
}

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
 * Derive the latest move from two consecutive authoritative boards:
 * the origin is the one lost square that held a piece of the landing
 * piece's color (captured squares hold the opposite color).
 * captures = lost squares minus the origin itself.
 */
function diffLastMove(
  prev: GameState,
  next: GameState,
): { from: [number, number]; to: [number, number]; mover: Role; captures: number } | null {
  const lost: [number, number, Role][] = [];
  let gained: [number, number, Role] | null = null;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      const was = prev.board[r][c];
      const now = next.board[r][c];
      if (was && !now) lost.push([r, c, was.color]);
      if (now && !was) gained = [r, c, now.color];
    }
  }
  if (!gained) return null;
  const landing = gained;
  const origin = lost.find(([, , color]) => color === landing[2]);
  if (!origin) return null;
  return {
    from: [origin[0], origin[1]],
    to: [landing[0], landing[1]],
    mover: landing[2],
    captures: lost.length - 1,
  };
}

function feltCard(children: ReactNode) {
  return (
    <div className="grid justify-items-center gap-4 rounded-[var(--dame-radius)] border border-[rgba(242,237,227,0.08)] bg-[var(--dame-surface-deep)] px-6 py-12 text-center">
      {children}
    </div>
  );
}

function GamePageInner() {
  const params = useParams();
  const search = useSearchParams();
  const rawId = params.gameId;
  const gameId =
    typeof rawId === "string" ? rawId : Array.isArray(rawId) ? (rawId[0] ?? "") : "";
  const requestedRole: Role = isRole(search.get("role")) ? (search.get("role") as Role) : "white";

  const [token, setToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/room?gameId=${encodeURIComponent(gameId)}&role=${requestedRole}`,
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(
            res.status === 401
              ? "Sign in to join this game."
              : (data?.error ?? `Join failed (${res.status})`),
          );
        }
        const data = (await res.json()) as { token: string };
        if (!cancelled) {
          setToken(data.token);
          setTokenError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setTokenError(err instanceof Error ? err.message : "Join failed.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, requestedRole]);

  if (!gameId) {
    return feltCard(
      <>
        <h2 className="font-heading text-2xl font-semibold">Game not found</h2>
        <p data-testid="join-error" className="text-sm text-[var(--dame-danger)]">
          Missing game id.
        </p>
        <Link href="/play" className="text-sm text-[var(--dame-accent-hi)] underline-offset-4 hover:underline">
          Back to Play
        </Link>
      </>,
    );
  }
  if (tokenError) {
    return feltCard(
      <>
        <h2 className="font-heading text-2xl font-semibold">Can&apos;t join this game</h2>
        <p data-testid="join-error" className="max-w-sm text-sm text-[var(--dame-danger)]">
          {tokenError}
        </p>
        <Link
          href="/play/join"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--dame-radius)] bg-[var(--dame-accent)] px-5 py-2.5 font-semibold text-[var(--dame-accent-ink)]"
        >
          <UserPlus size={16} /> Find an opponent
        </Link>
      </>,
    );
  }
  if (!token) {
    return feltCard(
      <>
        <span
          aria-hidden="true"
          className="h-3 w-3 animate-pulse rounded-full"
          style={{ background: "var(--dame-accent)" }}
        />
        <h2 className="font-heading text-2xl font-semibold">Setting the board…</h2>
        <p data-testid="join-loading" className="text-sm text-[var(--dame-muted)]">
          Joining as {requestedRole === "white" ? "White" : "Black"}…
        </p>
      </>,
    );
  }
  return <OnlineBoard gameId={gameId} token={token} initialRole={requestedRole} />;
}

function OnlineBoard({
  gameId,
  token,
  initialRole,
}: {
  gameId: string;
  token: string;
  initialRole: Role;
}) {
  const {
    state,
    version,
    connected,
    you,
    opponentConnected,
    end,
    sendMove,
    messages,
    opponentTyping,
    sendChat,
    sendTyping,
  } = useGameRoom({ gameId, token });
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const router = useRouter();
  const [rematching, setRematching] = useState(false);
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

  // Screen-reader move announcements. Own-move descriptions surface once
  // the authoritative version confirms them (version === atVersion + 1);
  // any other state (incl. remote moves) falls back to the turn label so
  // every turn change is announced. Selection text shows until the next
  // interaction. All hooks stay above the early return (Rules of Hooks).
  const [announceMove, setAnnounceMove] = useState<{
    text: string;
    atVersion: number;
  } | null>(null);
  const [announceSelect, setAnnounceSelect] = useState<string | null>(null);

  // Last-move trail + remote multi-capture "faah": derive from consecutive
  // authoritative boards. Own moves already sounded in handleSquare.
  const prevStateRef = useRef<GameState | null>(null);
  const [lastMove, setLastMove] = useState<{ from: [number, number]; to: [number, number] } | null>(
    null,
  );
  useEffect(() => {
    if (!state) return;
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    if (!prev) return;
    const diff = diffLastMove(prev, state);
    if (!diff) return;
    setLastMove(diff);
    if (you && diff.mover !== you && diff.captures > 1) playMultiCapture();
  }, [state, you]);

  // Rematch: fresh gameId, roles swapped (host takes the other color).
  async function rematch() {
    if (rematching) return;
    setRematching(true);
    try {
      const res = await fetch("/api/room", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => null)) as {
        gameId?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.gameId) {
        throw new Error(
          res.status === 401
            ? "Sign in to start a rematch."
            : (data?.error ?? `Rematch failed (${res.status})`),
        );
      }
      const nextRole: Role = initialRole === "white" ? "black" : "white";
      router.push(`/play/${data.gameId}?role=${nextRole}`);
    } catch (err) {
      // Error path outside gameplay feedback — a toast is fine here.
      toast.error(err instanceof Error ? err.message : "Rematch failed.");
      setRematching(false);
    }
  }

  // Drop stale selection without an effect (server is authoritative):
  // if the selected piece is no longer ours to move, treat as unselected.
  const activeSelected =
    selected && state?.board[selected[0]]?.[selected[1]]?.color === state?.turn
      ? selected
      : null;

  const moves = useMemo(() => (state ? legalMoves(state) : []), [state]);
  const capturesMandatory = useMemo(
    () => moves.some((m) => m.captures.length > 0),
    [moves],
  );
  const selectedMoves = useMemo(
    () =>
      activeSelected
        ? moves.filter(
            (m) => m.from[0] === activeSelected[0] && m.from[1] === activeSelected[1],
          )
        : [],
    [moves, activeSelected],
  );
  const destIds = useMemo(
    () => new Set(selectedMoves.map((m) => `${m.to[0]},${m.to[1]}`)),
    [selectedMoves],
  );
  const captureDestIds = useMemo(
    () =>
      new Set(
        selectedMoves
          .filter((m) => m.captures.length > 0)
          .map((m) => `${m.to[0]},${m.to[1]}`),
      ),
    [selectedMoves],
  );

  // Winner + fanfare BEFORE the early return: hook order must be identical
  // on every render (previously useEffect sat below `if (!state)`, crashing
  // with "Rendered more hooks" as soon as the first state arrived).
  const winner = end?.winner ?? state?.winner ?? null;
  useEffect(() => {
    if (winner) playWin();
  }, [winner]);

  if (!state) {
    return feltCard(
      <>
        <span
          aria-hidden="true"
          className="h-3 w-3 animate-pulse rounded-full"
          style={{ background: "var(--dame-accent)" }}
        />
        <h2 className="font-heading text-2xl font-semibold">Game {gameId.slice(0, 8)}</h2>
        <p data-testid="sync-loading" className="text-sm text-[var(--dame-muted)]">
          {connected ? "Syncing board…" : "Connecting…"}
        </p>
      </>,
    );
  }

  function handleSquare(r: number, c: number) {
    if (!state || state.winner || end?.winner) return;
    // Client-side guard only — server remains authoritative (rejects wrong turn).
    if (you && you !== state.turn) {
      // Not your turn: gentle shake only (board is dimmed).
      playInvalid();
      setShakeSquare([r, c]);
      after(SHAKE_MS, () => setShakeSquare(null));
      setSelected(null);
      setAnnounceSelect(null);
      setAnnounceMove(null);
      return;
    }
    const dest = selectedMoves.find((m) => m.to[0] === r && m.to[1] === c);
    if (activeSelected && dest) {
      const next = applyMove(state, dest);
      const mover = state.turn === "white" ? "White" : "Black";
      const after_ = next.winner
        ? `${next.winner === "white" ? "White" : "Black"} wins`
        : `${next.turn === "white" ? "White" : "Black"} to move`;
      const capture =
        dest.captures.length > 0 ? ` capturing ${dest.captures.length}` : "";
      setAnnounceSelect(null);
      setAnnounceMove({
        text: `${mover} moved from row ${dest.from[0]} column ${dest.from[1]} to row ${dest.to[0]} column ${dest.to[1]}${capture} — ${after_}`,
        atVersion: version,
      });
      if (dest.promotes) {
        setBurstSquare(dest.to);
        after(BURST_MS, () => setBurstSquare(null));
      }
      sendMove(dest);
      setSelected(null);
      setPulseIds(null);
      if (dest.captures.length > 1) playMultiCapture();
      else if (dest.captures.length > 0) playCapture();
      else playMove();
      return;
    }
    const piece = state.board[r]?.[c];
    if (piece && piece.color === state.turn) {
      const pieceMoves = moves.filter((m) => m.from[0] === r && m.from[1] === c);
      if (pieceMoves.length === 0) {
        setSelected(null);
        setAnnounceSelect(null);
        playInvalid();
        if (capturesMandatory) {
          // Teach the majority-capture rule: pulse the pieces that must capture.
          setPulseIds(new Set(moves.map((m) => `${m.from[0]},${m.from[1]}`)));
          after(PULSE_MS, () => setPulseIds(null));
          setAnnounceSelect(
            `A capture is mandatory. The pulsing pieces must capture — piece at row ${r} column ${c} cannot move.`,
          );
        } else {
          setShakeSquare([r, c]);
          after(SHAKE_MS, () => setShakeSquare(null));
          setAnnounceSelect("Illegal move");
        }
      } else {
        setSelected([r, c]);
        setPulseIds(null);
        setAnnounceMove(null);
        const name = state.turn === "white" ? "White" : "Black";
        setAnnounceSelect(`${name} ${piece.kind} selected at row ${r} column ${c}`);
      }
      return;
    }
    // Invalid target: shake + flash + thud, no text popup.
    playInvalid();
    setShakeSquare([r, c]);
    after(SHAKE_MS, () => setShakeSquare(null));
    setAnnounceSelect("Illegal move");
  }

  const turnName = state.turn === "white" ? "White" : "Black";
  const roleLabel = you ?? initialRole;
  const roleName = roleLabel === "white" ? "White" : "Black";
  const opponentName = roleLabel === "white" ? "Black" : "White";
  const opponentColor: Role = roleLabel === "white" ? "black" : "white";
  const flipped = roleLabel === "black";
  const myTurn = !winner && you === state.turn;
  const boardDimmed = !winner && !myTurn;

  const turnFallback = winner ? `${winner === "white" ? "White" : "Black"} wins` : `${turnName} to move`;
  const announcement =
    !winner && announceMove && version === announceMove.atVersion + 1
      ? announceMove.text
      : (!winner && announceSelect) || turnFallback;

  const reasonNote = end?.reason && end.reason !== "win" ? ` · ${end.reason}` : "";

  return (
    <div className="grid gap-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span
          data-testid="game-chip"
          className="rounded-full border border-[rgba(242,237,227,0.12)] bg-[var(--dame-surface-deep)] px-3 py-1 font-mono text-xs text-[var(--dame-muted)]"
        >
          game {gameId.slice(0, 8)}
        </span>
        <span className="flex items-center gap-2 text-xs font-medium text-[var(--dame-muted)]">
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${connected ? "animate-pulse" : ""}`}
            style={{ background: connected ? "#5fbf6f" : "var(--dame-danger)" }}
          />
          {connected ? "Live" : "Reconnecting…"}
          <PieceStylePicker />
          <SoundToggle />
        </span>
      </div>
      <p data-testid="presence-label" className="sr-only">
        You play {roleName} · Opponent {opponentConnected ? "online" : "offline"} ·{" "}
        {connected ? "Live" : "Reconnecting…"} · v{version}
      </p>
      <p data-testid="turn-label" className="sr-only">
        {winner ? `${winner === "white" ? "White" : "Black"} wins` : `${turnName} to move`}
      </p>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,600px)_320px] lg:items-start lg:justify-center">
        <div className="grid min-w-0 justify-items-center gap-3">
          <PlayerPlaque
            name={opponentName}
            color={opponentColor}
            captured={20 - countColor(state, roleLabel)}
            active={!winner && state.turn === opponentColor}
            note={`Opponent · ${opponentConnected ? "online" : "offline"}`}
          />
          <div className="relative w-full" style={{ maxWidth: 600 }}>
            <div
              style={{
                transform: flipped ? "rotate(180deg)" : undefined,
                transition: "transform 300ms ease",
              }}
            >
              <AnimatedBoard
                state={state}
                selected={activeSelected}
                destIds={destIds}
                captureDestIds={captureDestIds}
                onSquare={handleSquare}
                boardLabel="Online checkers board"
                showWinnerBanner={false}
                announcement={announcement}
                lastMove={lastMove}
                mustCaptureIds={pulseIds ?? undefined}
                shakeSquare={shakeSquare}
                burstSquare={burstSquare}
                liftColor={myTurn ? roleLabel : null}
                dimmed={boardDimmed}
              />
            </div>
            {winner ? (
              <div
                data-testid="winner-banner"
                role="status"
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-[18px] bg-[rgba(14,18,12,0.72)] px-6 text-center backdrop-blur-[2px]"
              >
                <span className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
                  {winner === "white" ? "White wins" : "Black wins"}
                  {reasonNote}
                </span>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    data-testid="rematch-button"
                    disabled={rematching}
                    onClick={rematch}
                    className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[var(--dame-radius)] px-5 py-2.5 font-semibold text-[var(--dame-accent-ink)] shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-transform duration-150 hover:scale-[1.03] disabled:opacity-50"
                    style={{ background: "var(--dame-accent)" }}
                  >
                    <RotateCcw size={16} /> {rematching ? "Starting…" : "Rematch"}
                  </button>
                  <button
                    type="button"
                    data-testid="new-opponent"
                    onClick={() => router.push("/play/join")}
                    className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[var(--dame-radius)] border border-[rgba(242,237,227,0.2)] px-5 py-2.5 font-medium transition-colors duration-150 hover:border-[rgba(201,162,39,0.5)]"
                  >
                    <UserPlus size={16} /> New opponent
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <PlayerPlaque
            name={`${roleName} · You`}
            color={roleLabel}
            captured={20 - countColor(state, opponentColor)}
            active={myTurn}
          />
        </div>
        <div className="grid min-w-0 content-start gap-4">
          <ChatPanel
            messages={messages}
            you={you}
            opponentTyping={opponentTyping}
            onSend={sendChat}
            onTyping={sendTyping}
          />
          <VoiceBar enabled={false} />
        </div>
      </div>
      <Toaster />
    </div>
  );
}

export default function GamePage() {
  return (
    <Suspense fallback={<div className="py-8 text-sm text-[var(--dame-muted)]">Loading game…</div>}>
      <GamePageInner />
    </Suspense>
  );
}
