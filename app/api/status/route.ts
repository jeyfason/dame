import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export interface DbStatus {
  ok: boolean;
  latencyMs: number;
}

export interface WorkerStatus {
  ok: boolean;
}

export interface StatusBody {
  ok: boolean;
  db: DbStatus;
  worker: WorkerStatus;
  version: string;
  release: string;
}

export interface StatusDeps {
  pingDb: () => Promise<DbStatus>;
  pingWorker: () => Promise<WorkerStatus>;
  getVersion: () => string;
  getRelease: () => string;
}

export function getVersion(): string {
  return process.env.APP_VERSION ?? "0.1.0";
}

// Release tag: SENTRY_RELEASE env (CI sets to git SHA), fallback display.
export function getRelease(): string {
  return (
    process.env.SENTRY_RELEASE ??
    process.env.NEXT_PUBLIC_SENTRY_RELEASE ??
    "dev"
  );
}

export function workerHealthUrl(): string | null {
  if (process.env.ROOM_WORKER_HEALTH_URL) {
    return process.env.ROOM_WORKER_HEALTH_URL;
  }
  const ws = process.env.NEXT_PUBLIC_ROOM_WS_URL;
  if (!ws) return null;
  try {
    const u = new URL(ws.replace(/^ws/, "http"));
    return `${u.protocol}//${u.host}/health`;
  } catch {
    return null;
  }
}

async function pingDb(): Promise<DbStatus> {
  if (!process.env.DATABASE_URL) return { ok: false, latencyMs: 0 };
  const start = Date.now();
  try {
    const sql = neon(process.env.DATABASE_URL);
    await sql`select 1`;
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    // No secrets in response: boolean only.
    return { ok: false, latencyMs: Date.now() - start };
  }
}

async function pingWorker(): Promise<WorkerStatus> {
  const url = workerHealthUrl();
  if (!url) return { ok: false };
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

// Pure builder for tests; GET below wires real deps.
export async function buildStatus(deps: StatusDeps): Promise<StatusBody> {
  const [db, worker] = await Promise.all([deps.pingDb(), deps.pingWorker()]);
  const version = deps.getVersion();
  const release = deps.getRelease();
  return { ok: db.ok && worker.ok, db, worker, version, release };
}

export async function GET() {
  const body = await buildStatus({
    pingDb,
    pingWorker,
    getVersion,
    getRelease,
  });
  return NextResponse.json(body);
}
