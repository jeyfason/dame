// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { act } from "react";
import { renderHook } from "@testing-library/react";
import { initialBoard, legalMoves } from "@/lib/rules/international";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { toast } from "sonner";
import { useGameRoom } from "./useGameRoom";

type Handler = ((ev: unknown) => void) | null;

class FakeWS {
  static instances: FakeWS[] = [];
  url: string;
  sent: string[] = [];
  onopen: Handler = null;
  onmessage: Handler = null;
  onclose: Handler = null;
  onerror: Handler = null;
  readyState = 1;
  constructor(url: string) {
    this.url = url;
    FakeWS.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  serverOpen() {
    this.onopen?.({});
  }
  serverMessage(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
}

function lastWs() {
  return FakeWS.instances[FakeWS.instances.length - 1]!;
}

beforeEach(() => {
  FakeWS.instances = [];
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useGameRoom optimistic UI (Task 3 RED)", () => {
  it("optimistic apply flips turn instantly", async () => {
    const { result } = renderHook(() =>
      useGameRoom({
        gameId: "game-123",
        token: "tok",
        wsUrl: "ws://test",
        wsFactory: ((url: string) => new FakeWS(url)) as unknown as (
          url: string,
        ) => WebSocket,
        reconnect: false,
      }),
    );
    const ws = lastWs();
    const snap = initialBoard();
    await act(async () => {
      ws.serverOpen();
      ws.serverMessage({ t: "state", state: snap, version: 0 });
    });
    expect(result.current.state?.turn).toBe("white");

    const move = legalMoves(snap)[0]!;
    await act(async () => {
      result.current.sendMove(move);
    });
    // Optimistic: turn flips before any server confirm.
    expect(result.current.state?.turn).toBe("black");
    const sent = ws.sent.map((s) => JSON.parse(s));
    expect(sent).toContainEqual({ t: "move", move, baseVersion: 0 });
  });

  it("server reject rolls back + toast", async () => {
    const { result } = renderHook(() =>
      useGameRoom({
        gameId: "game-123",
        token: "tok",
        wsUrl: "ws://test",
        wsFactory: ((url: string) => new FakeWS(url)) as unknown as (
          url: string,
        ) => WebSocket,
        reconnect: false,
      }),
    );
    const ws = lastWs();
    const snap = initialBoard();
    await act(async () => {
      ws.serverOpen();
      ws.serverMessage({ t: "state", state: snap, version: 0 });
    });
    const move = legalMoves(snap)[0]!;
    await act(async () => {
      result.current.sendMove(move);
    });
    expect(result.current.state?.turn).toBe("black");

    await act(async () => {
      ws.serverMessage({ t: "reject", reason: "illegal move", state: snap, version: 0 });
    });
    expect(result.current.state?.turn).toBe("white");
    expect(result.current.state?.board).toEqual(snap.board);
    expect(vi.mocked(toast.error)).toHaveBeenCalled();
  });
});

describe("useGameRoom resync/presence/end (Task 4 follow-up)", () => {
  function setup() {
    const { result } = renderHook(() =>
      useGameRoom({
        gameId: "game-123",
        token: "tok",
        wsUrl: "ws://test",
        wsFactory: ((url: string) => new FakeWS(url)) as unknown as (
          url: string,
        ) => WebSocket,
        reconnect: false,
      }),
    );
    return { result, ws: lastWs(), snap: initialBoard() };
  }

  it("stale rejoin resyncs to latest authoritative state", async () => {
    const { result, ws, snap } = setup();
    await act(async () => {
      ws.serverOpen();
      ws.serverMessage({ t: "state", state: snap, version: 0 });
      ws.serverMessage({ t: "state", state: { ...snap, turn: "black" }, version: 3 });
    });
    expect(result.current.version).toBe(3);
    expect(result.current.state?.turn).toBe("black");
  });

  it("presence sets role and opponent flag", async () => {
    const { result, ws, snap } = setup();
    await act(async () => {
      ws.serverOpen();
      ws.serverMessage({ t: "state", state: snap, version: 0 });
      ws.serverMessage({ t: "presence", you: "white", opponentConnected: true });
    });
    expect(result.current.you).toBe("white");
    expect(result.current.opponentConnected).toBe(true);
  });

  it("end frame exposes winner and reason", async () => {
    const { result, ws, snap } = setup();
    await act(async () => {
      ws.serverOpen();
      ws.serverMessage({ t: "state", state: snap, version: 0 });
      ws.serverMessage({ t: "end", winner: "black", reason: "win" });
    });
    expect(result.current.end).toEqual({ winner: "black", reason: "win" });
  });
});
