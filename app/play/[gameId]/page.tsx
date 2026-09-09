"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { legalMoves } from "@/lib/rules/international";
import { playCapture, playMove, playWin } from "@/lib/sound";
import { useGameRoom, type Role } from "@/hooks/useGameRoom";
import { AnimatedBoard } from "@/components/dame/AnimatedBoard";
import { SoundToggle } from "@/components/dame/SoundToggle";
import { ChatPanel } from "@/components/dame/ChatPanel";
import { VoiceBar } from "@/components/dame/VoiceBar";
import { Toaster } from "@/components/ui/sonner";

function isRole(v: string | null): v is Role {
  return v === "white" || v === "black";
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
    return (
      <div className="grid gap-6 py-8">
        <h2 className="text-2xl font-bold">Game</h2>
        <p data-testid="join-error" className="text-sm text-red-400">
          Missing game id.
        </p>
        <Toaster />
      </div>
    );
  }
  if (tokenError) {
    return (
      <div className="grid gap-6 py-8">
        <h2 className="text-2xl font-bold">Game {gameId}</h2>
        <p data-testid="join-error" className="text-sm text-red-400">
          {tokenError}
        </p>
        <Toaster />
      </div>
    );
  }
  if (!token) {
    return (
      <div className="grid gap-6 py-8">
        <h2 className="text-2xl font-bold">Game {gameId}</h2>
        <p data-testid="join-loading" className="text-sm opacity-70">
          Joining as {requestedRole}…
        </p>
        <Toaster />
      </div>
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

  if (!state) {
    return (
      <div className="grid gap-6 py-8">
        <h2 className="text-2xl font-bold">Game {gameId}</h2>
        <p data-testid="sync-loading" className="text-sm opacity-70">
          {connected ? "Syncing board…" : "Connecting…"}
        </p>
        <Toaster />
      </div>
    );
  }

  function handleSquare(r: number, c: number) {
    if (!state || state.winner || end?.winner) return;
    // Client-side guard only — server remains authoritative (rejects wrong turn).
    if (you && you !== state.turn) {
      toast.error("Not your turn");
      setSelected(null);
      return;
    }
    const dest = selectedMoves.find((m) => m.to[0] === r && m.to[1] === c);
    if (activeSelected && dest) {
      sendMove(dest);
      setSelected(null);
      if (dest.captures.length > 0) playCapture();
      else playMove();
      return;
    }
    const piece = state.board[r]?.[c];
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
  const winner = end?.winner ?? state.winner;
  const roleLabel = you ?? initialRole;
  const roleName = roleLabel === "white" ? "White" : "Black";

  // Win fanfare on authoritative end (local + remote moves).
  useEffect(() => {
    if (winner) playWin();
  }, [winner]);

  return (
    <div className="grid gap-4 py-8">
      <h2 className="text-2xl font-bold">Game {gameId}</h2>
      <p data-testid="turn-label" className="text-sm font-semibold">
        {winner
          ? `${winner === "white" ? "White" : "Black"} wins`
          : `${turnName} to move`}
      </p>
      <p data-testid="presence-label" className="text-sm opacity-70">
        You play {roleName} · Opponent {opponentConnected ? "online" : "offline"} ·{" "}
        {connected ? "Live" : "Reconnecting…"} · v{version}
      </p>
      {winner ? (
        <div
          data-testid="winner-banner"
          className="grid gap-3 rounded-[var(--dame-radius)] border border-white/10 px-4 py-3"
          style={{ background: "var(--dame-felt-deep)" }}
        >
          <span className="font-bold">
            {winner === "white" ? "White" : "Black"} wins!
            {end?.reason && end.reason !== "win" ? ` (${end.reason})` : ""}
          </span>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              data-testid="rematch-button"
              disabled={rematching}
              onClick={rematch}
              className="rounded-[var(--dame-radius)] bg-[var(--dame-gold)] px-5 py-3 font-semibold text-black disabled:opacity-50"
            >
              {rematching ? "Starting…" : "Rematch (swap colors)"}
            </button>
            <button
              type="button"
              data-testid="new-opponent"
              onClick={() => router.push("/play/join")}
              className="rounded-[var(--dame-radius)] border border-white/20 px-5 py-3"
            >
              New opponent
            </button>
          </div>
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,560px)_320px] lg:items-start">
        <div className="grid gap-4">
          <AnimatedBoard
            state={state}
            selected={activeSelected}
            destIds={destIds}
            onSquare={handleSquare}
            boardLabel="Online checkers board"
            showWinnerBanner={false}
          />
          <div className="flex flex-wrap gap-3">
            <SoundToggle />
          </div>
        </div>
        <div className="grid content-start gap-4">
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
    <Suspense fallback={<div className="py-8 text-sm opacity-70">Loading game…</div>}>
      <GamePageInner />
    </Suspense>
  );
}
