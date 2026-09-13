"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, LogIn, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

const card =
  "grid content-start gap-4 rounded-[var(--dame-radius)] border border-[rgba(242,237,227,0.08)] bg-[var(--dame-surface-deep)] p-5 sm:p-6";
const goldBtn =
  "inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-[var(--dame-radius)] bg-[var(--dame-accent)] px-5 py-2.5 font-semibold text-[var(--dame-accent-ink)] transition-transform duration-150 hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50";
const ghostBtn =
  "inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-[var(--dame-radius)] border border-[rgba(242,237,227,0.16)] bg-transparent px-5 py-2.5 font-medium transition-colors duration-150 hover:border-[rgba(201,162,39,0.45)] disabled:cursor-not-allowed disabled:opacity-50";
const errorText =
  "text-sm text-[var(--dame-danger)]";

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
    <div className="grid gap-6 py-4 md:grid-cols-2">
      <h1 className="sr-only">Play a friend</h1>

      <section className={card} aria-label="Invite a friend">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full"
            style={{ background: "rgba(201,162,39,0.14)", color: "var(--dame-accent-hi)" }}
          >
            <UserPlus size={18} />
          </span>
          <h2 className="font-heading text-xl font-semibold">Invite a friend</h2>
        </div>
        <p className="text-sm leading-relaxed text-[var(--dame-muted)]">
          Create a code, share it, then open the game as White.
        </p>
        <div className="flex flex-wrap gap-3">
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
          <p data-testid="invite-error" className={errorText}>
            {mintError}
          </p>
        ) : null}
        {invite ? (
          <div className="grid gap-3 rounded-[var(--dame-radius)] border border-[rgba(201,162,39,0.35)] bg-[rgba(201,162,39,0.06)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--dame-muted)]">
              Share this code · one use · 24h
            </p>
            <p
              data-testid="invite-code"
              className="text-center font-heading text-4xl font-semibold tracking-[0.24em]"
              style={{ color: "var(--dame-accent-hi)" }}
            >
              {invite.code}
            </p>
            <p data-testid="invite-link" className="break-all text-xs text-[var(--dame-muted)]">
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
                <Copy size={16} /> Copy link
              </button>
              <button
                type="button"
                data-testid="open-as-white"
                className={goldBtn}
                onClick={() =>
                  router.push(`/play/${invite.gameId}?role=white`)
                }
              >
                <LogIn size={16} /> Open game as White
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className={card} aria-label="Join with a code">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full"
            style={{ background: "rgba(201,162,39,0.14)", color: "var(--dame-accent-hi)" }}
          >
            <LogIn size={18} />
          </span>
          <h2 className="font-heading text-xl font-semibold">Join with a code</h2>
        </div>
        <p className="text-sm leading-relaxed text-[var(--dame-muted)]">
          Enter your friend&apos;s code to join as Black.
        </p>
        <form className="grid gap-3" onSubmit={joinWithCode}>
          <input
            data-testid="join-input"
            aria-label="Invite code"
            className="min-h-[52px] rounded-[var(--dame-radius)] border border-[rgba(242,237,227,0.16)] bg-transparent px-4 text-center text-xl font-semibold uppercase tracking-[0.24em] outline-none transition-colors focus:border-[var(--dame-accent)]"
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
          <p data-testid="join-error" className={errorText}>
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
    <Suspense fallback={<div className="py-8 text-sm text-[var(--dame-muted)]">Loading…</div>}>
      <JoinInner />
    </Suspense>
  );
}
