"use client";

import { useRef, useState } from "react";
import type { ChatMessage, Role } from "@/hooks/useGameRoom";

const EMOTES = [":gg:", ":wp:", ":oops:", ":nh:"] as const;

export function ChatPanel({
  messages,
  you,
  opponentTyping,
  onSend,
  onTyping,
}: {
  messages: ChatMessage[];
  you: Role | null;
  opponentTyping: boolean;
  onSend: (text: string) => void;
  onTyping?: (on: boolean) => void;
}) {
  const [draft, setDraft] = useState("");
  const typingOffRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pokeTyping() {
    onTyping?.(true);
    if (typingOffRef.current) clearTimeout(typingOffRef.current);
    // Timeout chain: input re-arms off at 2s < hook 3s < worker 5s, so the
    // indicator clears even when keystrokes stop or an off frame is lost.
    typingOffRef.current = setTimeout(() => onTyping?.(false), 2000);
  }

  function submit() {
    const text = draft.trim().slice(0, 500);
    if (!text) return;
    onSend(text);
    setDraft("");
    if (typingOffRef.current) clearTimeout(typingOffRef.current);
    onTyping?.(false);
  }

  return (
    <section
      data-testid="chat-panel"
      aria-label="Game chat"
      className="grid gap-3 rounded-[var(--dame-radius)] border border-[rgba(242,237,227,0.08)] bg-[var(--dame-surface-deep)] p-4"
    >
      <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--dame-muted)]">
        Chat
      </h3>
      <ul
        data-testid="chat-list"
        aria-label="Chat messages"
        aria-live="polite"
        className="grid max-h-[320px] content-start gap-2 overflow-y-auto pr-1"
      >
        {messages.length === 0 ? (
          <li className="text-sm text-[var(--dame-muted)]">No messages yet. Say gg!</li>
        ) : (
          messages.map((m, i) => {
            const mine = you && m.from === you;
            return (
              <li
                key={`${m.at}-${i}`}
                data-testid={`chat-msg-${i}`}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <span
                  className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm leading-snug ${
                    mine
                      ? "rounded-br-md bg-[rgba(201,162,39,0.16)] text-[var(--dame-text)]"
                      : "rounded-bl-md bg-[rgba(242,237,227,0.07)] text-[var(--dame-text)]"
                  }`}
                >
                  <span className="mr-1.5 text-xs font-semibold text-[var(--dame-muted)]">
                    {m.from === "white" ? "White" : "Black"}
                    {mine ? " (you)" : ""}
                  </span>
                  {m.text}
                </span>
              </li>
            );
          })
        )}
      </ul>
      <p
        data-testid="chat-typing"
        aria-live="polite"
        className="min-h-[20px] text-xs text-[var(--dame-muted)]"
      >
        {opponentTyping ? "Opponent is typing…" : ""}
      </p>
      <div className="flex flex-wrap gap-2" aria-label="Emote shortcuts">
        {EMOTES.map((e) => (
          <button
            key={e}
            type="button"
            data-testid={`emote-${e.replace(/:/g, "")}`}
            aria-label={`Insert emote ${e}`}
            onClick={() => {
              setDraft((d) => `${d ? `${d} ` : ""}${e}`.slice(0, 500));
              pokeTyping();
            }}
            className="min-h-[36px] cursor-pointer rounded-full border border-[rgba(242,237,227,0.14)] px-3 py-1.5 text-xs text-[var(--dame-muted)] transition-colors duration-150 hover:border-[rgba(201,162,39,0.45)] hover:text-[var(--dame-accent-hi)]"
          >
            {e}
          </button>
        ))}
      </div>
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          submit();
        }}
        className="flex min-w-0 gap-2"
      >
        <label htmlFor="dame-chat-input" className="sr-only">
          Chat message
        </label>
        <input
          id="dame-chat-input"
          data-testid="chat-input"
          aria-label="Chat message input"
          value={draft}
          maxLength={500}
          onChange={(ev) => {
            setDraft(ev.target.value);
            pokeTyping();
          }}
          placeholder="Message (max 500)…"
          className="min-h-[44px] min-w-0 flex-1 rounded-[var(--dame-radius)] border border-[rgba(242,237,227,0.16)] bg-transparent px-4 py-2 text-sm outline-none transition-colors focus:border-[var(--dame-accent)]"
        />
        <button
          type="submit"
          data-testid="chat-send"
          aria-label="Send chat message"
          disabled={!draft.trim()}
          className="min-h-[44px] cursor-pointer rounded-[var(--dame-radius)] px-5 py-2 text-sm font-semibold text-[var(--dame-accent-ink)] transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "var(--dame-accent)" }}
        >
          Send
        </button>
      </form>
    </section>
  );
}
