"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

const card =
  "rounded-[var(--dame-radius)] border border-white/10 p-5";
const cardBg = { background: "var(--dame-felt-deep)" } as const;
const goldBtn =
  "rounded-[var(--dame-radius)] bg-[var(--dame-gold)] px-5 py-3 font-semibold text-black disabled:opacity-50";
const ghostBtn =
  "rounded-[var(--dame-radius)] border border-white/20 px-5 py-3 disabled:opacity-50";

function JoinInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [code, setCode] = useState(() => search.get("code") ?? "");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [invite, setInvite] = useState<{ code: string; gameId: string } | null>(
    null,
  );
  const [mintError, setMintError] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);

  async function createInvite() {
    setMinting(true);
    setMintError(null);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => null)) as {
        code?: string;
        gameId?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.code || !data?.gameId) {
        throw new Error(
          res.status === 401
            ? "Sign in to invite a friend."
            : (data?.error ?? `Invite failed (${res.status})`),
        );
      }
      setInvite({ code: data.code, gameId: data.gameId });
    } catch (err) {
      setMintError(err instanceof Error ? err.message : "Invite failed.");
    } finally {
      setMinting(false);
    }
  }

  async function joinWithCode(e?: React.FormEvent) {
    e?.preventDefault();
    const clean = code.trim();
    if (!clean) {
      setJoinError("Enter an invite code.");
      return;
    }
    setJoining(true);
    setJoinError(null);
    try {
      // Redeem consumes the single-use code → gameId for the guest (black).
      const redeem = await fetch("/api/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: clean }),
      });
      const rdata = (await redeem.json().catch(() => null)) as {
        gameId?: string;
        error?: string;
      } | null;
      if (!redeem.ok || !rdata?.gameId) {
        throw new Error(
          redeem.status === 401
            ? "Sign in to join this game."
            : redeem.status === 410
              ? "That invite has expired."
              : redeem.status === 409
                ? "That invite was already used."
                : (rdata?.error ?? `Join failed (${redeem.status})`),
        );
      }
      // Verify a role token mints before leaving (fail-closed redirect).
      const token = await fetch(
        `/api/room?gameId=${encodeURIComponent(rdata.gameId)}&role=black`,
      );
      if (!token.ok) {
        throw new Error(
          token.status === 401
            ? "Sign in to join this game."
            : "Could not join the game room.",
        );
      }
      router.push(`/play/${encodeURIComponent(rdata.gameId)}?role=black`);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Join failed.");
    } finally {
      setJoining(false);
    }
  }

  const inviteLink =
    invite && typeof window !== "undefined"
      ? `${window.location.origin}/play/join?code=${invite.code}`
      : invite
        ? `/play/join?code=${invite.code}`
        : "";

  return (
    <div className="grid gap-6 py-8">
      <h2 className="text-2xl font-bold">Play a friend</h2>

      <section className={card} style={cardBg} aria-label="Invite a friend">
        <h3 className="text-lg font-bold">Invite a friend</h3>
        <p className="mt-1 text-sm opacity-70">
          Create a code, share it, then open the game as White.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            data-testid="create-invite"
            className={goldBtn}
            disabled={minting}
            onClick={createInvite}
          >
            {minting ? "Creating…" : "Create invite"}
          </button>
        </div>
        {mintError ? (
          <p data-testid="invite-error" className="mt-3 text-sm text-red-400">
            {mintError}
          </p>
        ) : null}
        {invite ? (
          <div className="mt-4 grid gap-2">
            <p className="text-sm opacity-70">Share this code (one use, 24h):</p>
            <p
              data-testid="invite-code"
              className="text-3xl font-extrabold tracking-[0.2em]"
            >
              {invite.code}
            </p>
            <p data-testid="invite-link" className="break-all text-sm opacity-70">
              {inviteLink}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className={ghostBtn}
                onClick={() => {
                  try {
                    void navigator.clipboard?.writeText(inviteLink);
                    toast.success("Invite link copied");
                  } catch {
                    toast.error("Copy failed — select the link manually");
                  }
                }}
              >
                Copy link
              </button>
              <button
                type="button"
                data-testid="open-as-white"
                className={goldBtn}
                onClick={() =>
                  router.push(`/play/${invite.gameId}?role=white`)
                }
              >
                Open game as White
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className={card} style={cardBg} aria-label="Join with a code">
        <h3 className="text-lg font-bold">Join with a code</h3>
        <p className="mt-1 text-sm opacity-70">
          Enter your friend&apos;s code to join as Black.
        </p>
        <form className="mt-4 flex flex-wrap gap-3" onSubmit={joinWithCode}>
          <input
            data-testid="join-input"
            aria-label="Invite code"
            className="min-h-[44px] min-w-[200px] flex-1 rounded-[var(--dame-radius)] border border-white/20 bg-transparent px-4 py-3 uppercase tracking-[0.2em]"
            placeholder="ABCDEFGH"
            autoComplete="off"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button
            type="submit"
            data-testid="join-submit"
            className={goldBtn}
            disabled={joining}
          >
            {joining ? "Joining…" : "Join game"}
          </button>
        </form>
        {joinError ? (
          <p data-testid="join-error" className="mt-3 text-sm text-red-400">
            {joinError}
          </p>
        ) : null}
      </section>
      <Toaster />
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<div className="py-8 text-sm opacity-70">Loading…</div>}>
      <JoinInner />
    </Suspense>
  );
}
