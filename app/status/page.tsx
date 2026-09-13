"use client";

import { useEffect, useState } from "react";

interface Status {
  ok: boolean;
  db: { ok: boolean; latencyMs: number };
  worker: { ok: boolean };
  version: string;
  release: string;
}

function Card({
  label,
  ok,
}: {
  label: string;
  ok: boolean;
}) {
  return (
    <div
      style={{
        background: ok ? "var(--dame-surface)" : "var(--dame-surface-deep)",
        color: "var(--dame-text)",
        border: `2px solid ${ok ? "#5fbf6f" : "var(--dame-danger)"}`,
        borderRadius: "var(--dame-radius)",
        padding: "1rem 1.25rem",
        minWidth: 160,
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.8 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{ok ? "● Green" : "● Red"}</div>
    </div>
  );
}

export default function StatusPage() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const res = await fetch("/api/status");
        if (!res.ok) return;
        const body = (await res.json()) as Status;
        if (live) setStatus(body);
      } catch {
        // keep last status on transient failure
      }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  return (
    <main
      style={{
        background: "var(--dame-felt-deep)",
        color: "var(--dame-text)",
        minHeight: "100vh",
        padding: "2rem",
      }}
    >
      <h1 className="font-heading" style={{ fontSize: 28, fontWeight: 600 }}>Dame status</h1>
      <p style={{ color: "var(--dame-muted)" }}>
        v{status?.version ?? "…"} · {status?.release ?? "…"}
      </p>
      <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
        <Card label="Database" ok={status?.db.ok ?? false} />
        <Card label="Worker" ok={status?.worker.ok ?? false} />
        <Card label="Overall" ok={status?.ok ?? false} />
      </div>
    </main>
  );
}
