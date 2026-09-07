import { ReactNode } from "react";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[var(--dame-ebony)] text-[var(--dame-ivory)]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <span className="text-lg font-bold tracking-tight">Dame</span>
        <span className="text-sm text-[var(--dame-muted)]">Chess.com for checkers</span>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-16">{children}</main>
    </div>
  );
}
