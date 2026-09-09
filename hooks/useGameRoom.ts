"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { applyMove } from "@/lib/rules/international";
import type { GameState, Move } from "@/lib/rules/types";

export type Role = "white" | "black";

export interface EndInfo {
  winner: "white" | "black" | null;
  reason: string;
}

export interface ChatMessage {
  from: Role;
  text: string;
  at: number;
}

export interface UseGameRoomOptions {
  gameId: string;
  token: string;
  wsUrl?: string;
  wsFactory?: (url: string) => WebSocket;
  /** Set false in unit tests to disable backoff timers. Default true. */
  reconnect?: boolean;
}

export interface UseGameRoomResult {
  state: GameState | null;
  version: number;
  connected: boolean;
  you: Role | null;
  opponentConnected: boolean;
  end: EndInfo | null;
  sendMove: (move: Move) => void;
  messages: ChatMessage[];
  opponentTyping: boolean;
  sendChat: (text: string) => void;
  sendTyping: (on: boolean) => void;
}

function resolveWsBase(explicit?: string): string {
  if (explicit) return explicit.replace(/\/$/, "");
  const env = process.env.NEXT_PUBLIC_ROOM_WS_URL;
  if (env) return env.replace(/\/$/, "");
  return "ws://localhost:8787";
}

function backoffMs(attempt: number): number {
  return Math.min(8000, 500 * 2 ** attempt);
}

export function useGameRoom(options: UseGameRoomOptions): UseGameRoomResult {
  const { gameId, token, wsUrl, wsFactory, reconnect = true } = options;
  const [state, setState] = useState<GameState | null>(null);
  const [version, setVersion] = useState(0);
  const [connected, setConnected] = useState(false);
  const [you, setYou] = useState<Role | null>(null);
  const [opponentConnected, setOpponentConnected] = useState(false);
  const [end, setEnd] = useState<EndInfo | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [opponentTyping, setOpponentTyping] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const versionRef = useRef(0);
  const stateRef = useRef<GameState | null>(null);
  const attemptRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mirror latest state into refs for event handlers (effect, not render).
  useEffect(() => {
    stateRef.current = state;
    versionRef.current = version;
  });

  useEffect(() => {
    let closed = false;
    const makeWs = wsFactory ?? ((url: string) => new WebSocket(url));
    const base = resolveWsBase(wsUrl);
    const url = `${base}/room/${encodeURIComponent(gameId)}/ws`;

    function clearTimer() {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }

    function scheduleReconnect() {
      if (closed || !reconnect) return;
      const delay = backoffMs(attemptRef.current);
      attemptRef.current += 1;
      clearTimer();
      timeoutRef.current = setTimeout(() => {
        if (!closed) connect();
      }, delay);
    }

    function connect() {
      clearTimer();
      let ws: WebSocket;
      try {
        ws = makeWs(url);
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      function clearTypingTimer() {
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
      }

      ws.onopen = () => {
        if (closed) return;
        attemptRef.current = 0;
        setConnected(true);
        try {
          ws.send(
            JSON.stringify({ t: "join", token, lastVersion: versionRef.current }),
          );
        } catch {
          // send failure surfaces via onclose/onerror below
        }
      };

      ws.onmessage = (ev: MessageEvent) => {
        let frame: Record<string, unknown>;
        try {
          frame =
            typeof ev.data === "string"
              ? (JSON.parse(ev.data) as Record<string, unknown>)
              : (JSON.parse(String(ev.data)) as Record<string, unknown>);
        } catch {
          return;
        }
        if (frame.t === "state") {
          const next = frame.state as GameState;
          const v = frame.version as number;
          setState(next);
          setVersion(v);
          return;
        }
        if (frame.t === "presence") {
          setYou(frame.you as Role);
          setOpponentConnected(Boolean(frame.opponentConnected));
          return;
        }
        if (frame.t === "reject") {
          const next = frame.state as GameState;
          const v = frame.version as number;
          const reason =
            typeof frame.reason === "string" ? frame.reason : "Move rejected";
          setState(next);
          setVersion(v);
          toast.error(reason);
          return;
        }
        if (frame.t === "end") {
          setEnd({
            winner: (frame.winner as EndInfo["winner"]) ?? null,
            reason: typeof frame.reason === "string" ? frame.reason : "win",
          });
          return;
        }
        if (frame.t === "chat") {
          const from = frame.from as Role;
          const text = frame.text as string;
          const at = frame.at as number;
          if ((from === "white" || from === "black") && typeof text === "string") {
            setMessages((prev) =>
              [...prev, { from, text, at: typeof at === "number" ? at : Date.now() }].slice(-100),
            );
          }
          return;
        }
        if (frame.t === "typing") {
          const on = Boolean(frame.on);
          if (on) {
            setOpponentTyping(true);
            clearTypingTimer();
            typingTimeoutRef.current = setTimeout(() => {
              if (!closed) setOpponentTyping(false);
            }, 3000);
          } else {
            clearTypingTimer();
            setOpponentTyping(false);
          }
        }
      };

      const handleClose = () => {
        if (closed) return;
        setConnected(false);
        scheduleReconnect();
      };
      ws.onclose = handleClose;
      ws.onerror = handleClose;
    }

    connect();
    return () => {
      closed = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      try {
        wsRef.current?.close();
      } catch {
        // ignore close errors on unmount
      }
      wsRef.current = null;
    };
    // version intentionally omitted: rejoin uses versionRef, not re-connect loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, token, wsUrl, reconnect]);

  const sendMove = useCallback((move: Move) => {
    const current = stateRef.current;
    if (!current) return;
    let optimistic: GameState;
    try {
      optimistic = applyMove(current, move);
    } catch {
      toast.error("Illegal move");
      return;
    }
    // Optimistic: flip board instantly; authoritative state confirms or rolls back.
    setState(optimistic);
    try {
      wsRef.current?.send(
        JSON.stringify({ t: "move", move, baseVersion: versionRef.current }),
      );
    } catch {
      toast.error("Connection lost — retrying");
    }
  }, []);

  const sendChat = useCallback((text: string) => {
    const trimmed = text.trim().slice(0, 500);
    if (!trimmed) return;
    try {
      wsRef.current?.send(JSON.stringify({ t: "chat", text: trimmed }));
    } catch {
      toast.error("Connection lost — retrying");
    }
  }, []);

  const sendTyping = useCallback((on: boolean) => {
    try {
      wsRef.current?.send(JSON.stringify({ t: "typing", on }));
    } catch {
      // typing is best-effort, no toast
    }
  }, []);

  return {
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
  };
}
