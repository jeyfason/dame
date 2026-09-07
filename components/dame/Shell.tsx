import { ReactNode } from "react";
import { UserBadge } from "@/components/dame/UserBadge";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[var(--dame-ebony)] text-[var(--dame-ivory)]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <span className="text-lg font-bold tracking-tight">Dame</span>
        <div className="flex items-center gap-4">
          <span className="text-base text-[var(--dame-muted-on-dark)]">Chess.com for checkers</span>
          <UserBadge />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-16">{children}</main>
    </div>
  );
}
