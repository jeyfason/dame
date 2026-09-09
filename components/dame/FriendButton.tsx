"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

type Relation = "unknown" | "none" | "outgoing" | "incoming" | "friends";

const btn =
  "min-h-[44px] cursor-pointer rounded-[var(--dame-radius)] px-5 py-3 text-sm font-semibold transition-opacity duration-150 hover:opacity-90 disabled:opacity-50";

// Profile friend button: Add / Requested / Accept+Decline / Friends+Remove.
// Resolves the current relation via GET /api/friends, acts via POST.
// Fail-closed: 401 surfaces a sign-in toast, never a silent no-op.
export function FriendButton({ userId }: { userId: string }) {
  const [relation, setRelation] = useState<Relation>("unknown");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/friends");
        if (!res.ok) {
          if (!cancelled) setRelation("none");
          return;
        }
        const data = (await res.json()) as {
          friends?: { userId: string }[];
          incoming?: { userId: string }[];
          outgoing?: { userId: string }[];
        };
        if (cancelled) return;
        if ((data.friends ?? []).some((f) => f.userId === userId)) {
          setRelation("friends");
        } else if ((data.incoming ?? []).some((f) => f.userId === userId)) {
          setRelation("incoming");
        } else if ((data.outgoing ?? []).some((f) => f.userId === userId)) {
          setRelation("outgoing");
        } else {
          setRelation("none");
        }
      } catch {
        if (!cancelled) setRelation("none");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function act(action: "request" | "accept" | "decline" | "remove") {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, userId }),
      });
      if (!res.ok) {
        throw new Error(
          res.status === 401
            ? "Sign in to add friends."
            : `Friend action failed (${res.status})`,
        );
      }
      if (action === "request") setRelation("outgoing");
      else if (action === "accept") setRelation("friends");
      else setRelation("none");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Friend action failed.");
    } finally {
      setBusy(false);
    }
  }

  if (relation === "unknown") {
    return (
      <button
        type="button"
        disabled
        aria-label="Loading friendship status"
        className={`${btn} border border-white/20`}
      >
        …
      </button>
    );
  }

  if (relation === "outgoing") {
    return (
      <p data-testid="friend-status" className="text-sm opacity-70">
        Friend request sent.
      </p>
    );
  }

  if (relation === "incoming") {
    return (
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          data-testid="friend-button"
          aria-label="Accept friend request"
          disabled={busy}
          onClick={() => act("accept")}
          className={btn}
          style={{ background: "var(--dame-gold)", color: "black" }}
        >
          Accept friend
        </button>
        <button
          type="button"
          data-testid="friend-decline"
          aria-label="Decline friend request"
          disabled={busy}
          onClick={() => act("decline")}
          className={`${btn} border border-white/20`}
        >
          Decline
        </button>
      </div>
    );
  }

  if (relation === "friends") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p data-testid="friend-status" className="text-sm opacity-70">
          Friends
        </p>
        <button
          type="button"
          data-testid="friend-button"
          aria-label="Remove friend"
          disabled={busy}
          onClick={() => act("remove")}
          className={`${btn} border border-white/20`}
        >
          Remove friend
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      data-testid="friend-button"
      aria-label="Add friend"
      disabled={busy}
      onClick={() => act("request")}
      className={btn}
      style={{ background: "var(--dame-gold)", color: "black" }}
    >
      Add friend
    </button>
  );
}
