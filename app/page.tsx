import Link from "next/link";
import { Link2, Trophy, Zap } from "lucide-react";
import { MiniDemoBoard } from "@/components/dame/MiniDemoBoard";

const brassBtn =
  "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-[var(--dame-accent)] px-7 py-3 text-base font-semibold text-[var(--dame-accent-ink)] shadow-[0_4px_14px_rgba(201,162,39,0.35)] transition-transform duration-150 hover:scale-[1.03]";
const ghostBtn =
  "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-[rgba(242,237,227,0.16)] bg-[var(--dame-surface-deep)] px-7 py-3 text-base font-medium text-[var(--dame-text)] transition-colors duration-150 hover:border-[rgba(201,162,39,0.45)]";

const FEATURES = [
  {
    icon: Zap,
    title: "Live rated matches",
    body: "Real-time international draughts on a shared board — every game rated, every move counted.",
  },
  {
    icon: Link2,
    title: "Invite links",
    body: "One tap creates a code. Send it to a friend and you're playing in seconds — no lobby hunting.",
  },
  {
    icon: Trophy,
    title: "Glicko ladder",
    body: "An honest rating with rating deviation, so your rank means something from game one.",
  },
] as const;

export default function Home() {
  return (
    <div className="grid gap-16 pb-8 pt-6 md:pt-12">
      {/* Hero */}
      <section className="grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <div className="grid justify-items-start gap-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--dame-accent)]">
            International draughts · 10×10
          </p>
          <h1 className="font-heading text-5xl font-semibold leading-[1.05] tracking-tight text-balance sm:text-6xl">
            Chess.com, but for checkers.
          </h1>
          <p className="max-w-md text-lg leading-relaxed text-[var(--dame-muted)]">
            A real walnut board in your browser. Sign up and be in a live rated
            match in under a minute — or pass and play with a friend.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/sign-up" className={brassBtn}>
              Play now
            </Link>
            <Link href="/play" className={ghostBtn}>
              Quick match
            </Link>
          </div>
        </div>
        <div className="mx-auto w-full max-w-[440px]">
          <MiniDemoBoard />
        </div>
      </section>

      {/* Feature rows */}
      <section aria-label="Why Dame" className="grid gap-4 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="grid content-start gap-3 rounded-[var(--dame-radius)] border border-[rgba(242,237,227,0.08)] bg-[var(--dame-surface-deep)] p-5 transition-colors duration-150 hover:border-[rgba(201,162,39,0.3)]"
          >
            <span
              aria-hidden="true"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full"
              style={{
                background: "rgba(201,162,39,0.14)",
                color: "var(--dame-accent-hi)",
              }}
            >
              <Icon size={20} />
            </span>
            <h2 className="font-heading text-lg font-semibold">{title}</h2>
            <p className="text-sm leading-relaxed text-[var(--dame-muted)]">{body}</p>
          </div>
        ))}
      </section>

      {/* Minimal footer */}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(242,237,227,0.08)] pt-6 text-sm text-[var(--dame-muted)]">
        <p>Built for the love of the game.</p>
        <div className="flex flex-wrap items-center gap-4">
          <p>Strict FMJD rules · Glicko-2 ratings</p>
          <a
            href="https://github.com/jeyfason"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 transition-colors duration-150 hover:text-[var(--dame-accent-hi)]"
          >
            <span aria-hidden="true" className="inline-flex">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
              </svg>
            </span>
            Developed by <span className="font-semibold text-[var(--dame-text)]">fason</span>
          </a>
        </div>
      </footer>
    </div>
  );
}
