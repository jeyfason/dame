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
      className="grid gap-3 rounded-[var(--dame-radius)] border border-white/10 p-4"
      style={{ background: "var(--dame-felt-deep)" }}
    >
      <h3 className="text-sm font-bold tracking-wide uppercase">Chat</h3>
      <ul
        data-testid="chat-list"
        aria-label="Chat messages"
        aria-live="polite"
        className="grid max-h-[320px] gap-2 overflow-y-auto"
      >
        {messages.length === 0 ? (
          <li className="text-sm opacity-70">No messages yet. Say gg!</li>
        ) : (
          messages.map((m, i) => (
            <li
              key={`${m.at}-${i}`}
              data-testid={`chat-msg-${i}`}
              className="text-sm"
            >
              <span className="font-semibold">
                {m.from === "white" ? "White" : "Black"}
                {you && m.from === you ? " (you)" : ""}:{" "}
              </span>
              <span>{m.text}</span>
            </li>
          ))
        )}
      </ul>
      <p
        data-testid="chat-typing"
        aria-live="polite"
        className="min-h-[20px] text-xs opacity-70"
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
            className="min-h-[44px] min-w-[44px] cursor-pointer rounded-[var(--dame-radius)] border border-white/20 px-3 py-2 text-sm transition-opacity duration-150 hover:opacity-80"
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
        className="flex gap-2"
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
          className="min-h-[44px] flex-1 rounded-[var(--dame-radius)] border border-white/20 bg-transparent px-4 py-2 text-sm outline-none"
        />
        <button
          type="submit"
          data-testid="chat-send"
          aria-label="Send chat message"
          disabled={!draft.trim()}
          className="min-h-[44px] cursor-pointer rounded-[var(--dame-radius)] px-5 py-2 text-sm font-semibold text-black transition-opacity duration-150 hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--dame-gold)" }}
        >
          Send
        </button>
      </form>
    </section>
  );
}
