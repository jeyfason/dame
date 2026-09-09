// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { act } from "react";
import { renderHook } from "@testing-library/react";
import { initialBoard } from "@/lib/rules/international";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

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
  vi.useRealTimers();
});

describe("useGameRoom chat (Stage 5 Task 1 RED)", () => {
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

  it("sendChat emits chat frame", async () => {
    const { result, ws, snap } = setup();
    await act(async () => {
      ws.serverOpen();
      ws.serverMessage({ t: "state", state: snap, version: 0 });
    });
    await act(async () => {
      result.current.sendChat("hello :gg:");
    });
    const sent = ws.sent.map((s) => JSON.parse(s));
    expect(sent).toContainEqual({ t: "chat", text: "hello :gg:" });
  });

  it("receives chat into messages", async () => {
    const { result, ws, snap } = setup();
    await act(async () => {
      ws.serverOpen();
      ws.serverMessage({ t: "state", state: snap, version: 0 });
      ws.serverMessage({ t: "chat", from: "black", text: "hi", at: 123 });
    });
    expect(result.current.messages).toEqual([{ from: "black", text: "hi", at: 123 }]);
  });

  it("typing on/off toggles opponentTyping", async () => {
    const { result, ws, snap } = setup();
    await act(async () => {
      ws.serverOpen();
      ws.serverMessage({ t: "state", state: snap, version: 0 });
      ws.serverMessage({ t: "typing", from: "black", on: true });
    });
    expect(result.current.opponentTyping).toBe(true);
    await act(async () => {
      ws.serverMessage({ t: "typing", from: "black", on: false });
    });
    expect(result.current.opponentTyping).toBe(false);
  });
});
