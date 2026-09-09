#!/usr/bin/env bun
/**
 * Dame Stage 6 Task 4 — load proof.
 *
 * N=100 clients across M=50 games vs a local worker (wrangler dev --local
 * / Miniflare), random legal moves via the engine, measuring p50/p95
 * round-trip + reject rate. Falls back to in-process decideMove timing when
 * no worker is reachable so the script is still useful in CI.
 *
 * Bun only: `bun worker/load/run.ts [--games 50] [--moves 20] [--url http://localhost:8787] [--batch 10]`
 * Never commits secrets: the dev server owns GAME_TOKEN_SECRET; this script
 * only uses tokens minted via POST /room (E2E_BYPASS_AUTH=1 on the server).
 */

import { applyMove, initialBoard, legalMoves } from "../../lib/rules/international";
import type { GameState, Move } from "../../lib/rules/types";

const args = process.argv.slice(2);
function flag(name: string, def: string): string {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? (args[i + 1] as string) : def;
}
const GAMES = Math.max(1, parseInt(flag("--games", "50"), 10) || 50);
const MOVES_PER_GAME = Math.max(1, parseInt(flag("--moves", "20"), 10) || 20);
// Concurrent games cap: 100 total clients across 50 games either way; the cap
// only staggers start times so local workerd (single-threaded SQLite DOs +
// 3-4s cold WS handshakes) survives the burst.
const BATCH = Math.max(1, parseInt(flag("--batch", "10"), 10) || 10);
const HTTP_BASE = (flag("--url", process.env.WORKER_URL ?? "http://localhost:8787") || "").replace(
  /\/$/,
  "",
);
const WS_BASE = HTTP_BASE.replace(/^http/, "ws");

interface Sample {
  rttMs: number;
  rejected: boolean;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, i)] as number;
}

function summarize(samples: Sample[], wallMs: number, gamesFinished: number, mode: string) {
  const rtts = samples.map((s) => s.rttMs).sort((a, b) => a - b);
  const rejects = samples.filter((s) => s.rejected).length;
  const sum = rtts.reduce((a, b) => a + b, 0);
  return {
    mode,
    games: GAMES,
    clients: GAMES * 2,
    movesPerGame: MOVES_PER_GAME,
    totalMoves: samples.length,
    rejects,
    rejectRate: samples.length ? rejects / samples.length : 0,
    gamesFinished,
    wallMs: Math.round(wallMs),
    throughputPerSec: wallMs > 0 ? (samples.length / wallMs) * 1000 : 0,
    minMs: rtts.length ? rtts[0] : 0,
    avgMs: rtts.length ? sum / rtts.length : 0,
    p50Ms: percentile(rtts, 50),
    p95Ms: percentile(rtts, 95),
    maxMs: rtts.length ? rtts[rtts.length - 1] : 0,
  };
}

/** Local mirror of worker/src/room.ts decideMove (room.ts imports
 *  cloudflare:workers, which Bun cannot resolve outside workerd). */
function decideMove(
  snapshot: { state: GameState; version: number },
  role: "white" | "black",
  move: Move,
  baseVersion: number,
):
  | { ok: true; state: GameState; version: number }
  | { ok: false; reason: string; state: GameState; version: number } {
  if (snapshot.state.winner) {
    return { ok: false, reason: "game over", state: snapshot.state, version: snapshot.version };
  }
  if (baseVersion !== snapshot.version) {
    return { ok: false, reason: "stale version", state: snapshot.state, version: snapshot.version };
  }
  if (role !== snapshot.state.turn) {
    return { ok: false, reason: "not your turn", state: snapshot.state, version: snapshot.version };
  }
  const legal = legalMoves(snapshot.state);
  const match = legal.find(
    (m) =>
      m.from[0] === move.from[0] &&
      m.from[1] === move.from[1] &&
      m.to[0] === move.to[0] &&
      m.to[1] === move.to[1] &&
      m.captures.length === move.captures.length &&
      m.captures.every((c, i) => c[0] === move.captures[i]?.[0] && c[1] === move.captures[i]?.[1]),
  );
  if (!match) {
    return { ok: false, reason: "illegal move", state: snapshot.state, version: snapshot.version };
  }
  try {
    const next = applyMove(snapshot.state, move);
    return { ok: true, state: next, version: snapshot.version + 1 };
  } catch {
    return { ok: false, reason: "illegal move", state: snapshot.state, version: snapshot.version };
  }
}

// --- minimal WS client with a frame queue (Bun native WebSocket) ---
// One persistent onmessage handler + queue: back-to-back server frames
// (state immediately followed by presence) are never lost to reassignment.

class Ws {
  private ws: WebSocket;
  private queue: string[] = [];
  private waiters: Array<{ res: (msg: string) => void; rej: (e: Error) => void; t: Timer }> = [];
  private opened: Promise<void>;
  private failAll: ((e: Error) => void) | null = null;

  constructor(url: string) {
    let res!: () => void;
    let rej!: (e: Error) => void;
    this.opened = new Promise<void>((r, j) => {
      res = r;
      rej = j;
    });
    this.failAll = rej;
    this.ws = new WebSocket(url);
    this.ws.onopen = () => res();
    this.ws.onerror = () => {
      const err = new Error("websocket error");
      rej(err);
      this.drainError(err);
    };
    this.ws.onclose = () => this.drainError(new Error("websocket closed"));
    this.ws.onmessage = (ev) => {
      const text = typeof ev.data === "string" ? ev.data : String(ev.data);
      const w = this.waiters.shift();
      if (w) {
        clearTimeout(w.t);
        w.res(text);
      } else {
        this.queue.push(text);
      }
    };
  }

  private drainError(err: Error): void {
    for (const w of this.waiters.splice(0)) {
      clearTimeout(w.t);
      w.rej(err);
    }
  }

  open(timeoutMs = 30_000): Promise<void> {
    return Promise.race([
      this.opened,
      new Promise<void>((_, rej) =>
        setTimeout(() => rej(new Error("ws open timeout")), timeoutMs),
      ),
    ]);
  }

  send(obj: unknown): void {
    this.ws.send(JSON.stringify(obj));
  }

  next(timeoutMs = 15_000): Promise<string> {
    const queued = this.queue.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise<string>((res, rej) => {
      const t = setTimeout(() => rej(new Error("ws frame timeout")), timeoutMs);
      this.waiters.push({ res, rej, t });
    });
  }

  /**
   * Next move result for a move sent at baseVersion. Skips stale broadcasts
   * (state frames queued from the opponent's earlier moves, version <=
   * baseVersion) and presence/chat frames; any reject is the live result.
   */
  async nextResult(
    baseVersion: number,
    timeoutMs = 15_000,
  ): Promise<{ t: string; state?: GameState; version?: number }> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const raw = await this.next(Math.max(1000, deadline - Date.now()));
      const frame = JSON.parse(raw) as { t: string; state?: GameState; version?: number };
      if (frame.t === "reject") return frame;
      if (frame.t === "end") return frame;
      if (
        frame.t === "state" &&
        typeof frame.version === "number" &&
        frame.version > baseVersion
      ) {
        return frame;
      }
      if (Date.now() > deadline) throw new Error("ws result timeout");
    }
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}

function pickRandom(moves: Move[]): Move {
  return moves[Math.floor(Math.random() * moves.length)] as Move;
}

async function runWsGame(): Promise<{ samples: Sample[]; finished: boolean }> {
  const samples: Sample[] = [];
  // 1. mint a fresh game (server owns the secret; bypass is server-side only)
  const res = await fetch(`${HTTP_BASE}/room`, { method: "POST" });
  if (!res.ok) throw new Error(`POST /room -> ${res.status}`);
  const { gameId, tokens } = (await res.json()) as {
    gameId: string;
    tokens: { white: string; black: string };
  };
  const url = `${WS_BASE}/room/${gameId}/ws`;
  const white = new Ws(url);
  const black = new Ws(url);
  try {
    await Promise.all([white.open(), black.open()]);
    white.send({ t: "join", token: tokens.white, lastVersion: 0 });
    black.send({ t: "join", token: tokens.black, lastVersion: 0 });
    let mirror: GameState = initialBoard();
    let version = 0;
    // Drain join responses (state + presence on each socket).
    for (const sock of [white, black]) {
      for (let i = 0; i < 6; i++) {
        const raw = await sock.next();
        const f = JSON.parse(raw) as { t: string; state?: GameState; version?: number };
        if (f.t === "state" && f.state && typeof f.version === "number") {
          mirror = f.state;
          version = f.version;
          break;
        }
      }
    }
    const socks = { white, black } as const;
    for (let i = 0; i < MOVES_PER_GAME; i++) {
      if (mirror.winner) return { samples, finished: true };
      const legal = legalMoves(mirror);
      if (legal.length === 0) return { samples, finished: mirror.winner !== null };
      const move = pickRandom(legal);
      const role = mirror.turn;
      const sock = socks[role];
      const baseVersion = version;
      const t0 = performance.now();
      sock.send({ t: "move", move, baseVersion });
      const frame = await sock.nextResult(baseVersion);
      const rtt = performance.now() - t0;
      if (frame.t === "reject") {
        samples.push({ rttMs: rtt, rejected: true });
        if (frame.state && typeof frame.version === "number") {
          mirror = frame.state;
          version = frame.version;
        }
        continue;
      }
      samples.push({ rttMs: rtt, rejected: false });
      if (frame.state && typeof frame.version === "number") {
        mirror = frame.state;
        version = frame.version;
      }
      if (frame.t === "end") return { samples, finished: true };
    }
    return { samples, finished: mirror.winner !== null };
  } finally {
    white.close();
    black.close();
  }
}

async function runWsLoad(): Promise<ReturnType<typeof summarize>> {
  const wall0 = performance.now();
  const all: Sample[] = [];
  let finished = 0;
  let failed = 0;
  for (let i = 0; i < GAMES; i += BATCH) {
    const batch = Array.from({ length: Math.min(BATCH, GAMES - i) }, () =>
      runWsGame().catch((e) => {
        failed += 1;
        console.error(`[load] game failed: ${(e as Error).message}`);
        return { samples: [], finished: false };
      }),
    );
    const results = await Promise.all(batch);
    for (const r of results) {
      all.push(...r.samples);
      if (r.finished) finished += 1;
    }
    console.error(`[load] progress ${Math.min(GAMES, i + BATCH)}/${GAMES} games (failed=${failed})`);
  }
  if (all.length === 0) throw new Error("no samples collected (worker unreachable?)");
  return summarize(all, performance.now() - wall0, finished, `ws ${WS_BASE} (wrangler dev --local)`);
}

async function runInProcessLoad(): Promise<ReturnType<typeof summarize>> {
  const wall0 = performance.now();
  const all: Sample[] = [];
  let finished = 0;
  for (let g = 0; g < GAMES; g++) {
    let snap = { state: initialBoard(), version: 0 };
    for (let i = 0; i < MOVES_PER_GAME; i++) {
      if (snap.state.winner) {
        finished += 1;
        break;
      }
      const legal = legalMoves(snap.state);
      if (legal.length === 0) break;
      const move = pickRandom(legal);
      const role = snap.state.turn;
      const t0 = performance.now();
      const d = decideMove(snap, role, move, snap.version);
      const rtt = performance.now() - t0;
      if (!d.ok) {
        all.push({ rttMs: rtt, rejected: true });
        snap = { state: d.state, version: d.version };
        continue;
      }
      all.push({ rttMs: rtt, rejected: false });
      snap = { state: d.state, version: d.version };
      if (d.state.winner) {
        finished += 1;
        break;
      }
    }
  }
  return summarize(all, performance.now() - wall0, finished, "in-process decideMove (no socket)");
}

let summary: Awaited<ReturnType<typeof runWsLoad>>;
try {
  // Probe first: if /health fails fast, fall back.
  const probe = await fetch(`${HTTP_BASE}/health`, { signal: AbortSignal.timeout(5000) }).catch(
    () => null,
  );
  if (!probe || !probe.ok) throw new Error("worker not reachable");
  summary = await runWsLoad();
} catch (err) {
  console.error(`[load] worker unreachable at ${HTTP_BASE} (${(err as Error).message}); in-process fallback`);
  summary = await runInProcessLoad();
}

console.log(JSON.stringify(summary, null, 2));
console.log(
  `[load] mode=${summary.mode} n=${summary.totalMoves} ` +
    `p50=${summary.p50Ms.toFixed(2)}ms p95=${summary.p95Ms.toFixed(2)}ms ` +
    `avg=${summary.avgMs.toFixed(2)}ms max=${summary.maxMs.toFixed(2)}ms ` +
    `rejects=${summary.rejects} (${(summary.rejectRate * 100).toFixed(2)}%) ` +
    `finished=${summary.gamesFinished}/${summary.games} ` +
    `wall=${summary.wallMs}ms throughput=${summary.throughputPerSec.toFixed(1)}/s`,
);
const TARGET_P95 = 150;
if (summary.p95Ms < TARGET_P95) console.log(`[load] PASS p95 < ${TARGET_P95}ms (local)`);
else {
  console.error(`[load] FAIL p95 >= ${TARGET_P95}ms`);
  process.exitCode = 1;
}
