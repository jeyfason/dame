import Link from "next/link";
import { Bot, ChevronRight, Swords, UserPlus } from "lucide-react";
import { LocalBoard } from "@/components/dame/LocalBoard";

function ModeCard({
  href,
  icon: Icon,
  title,
  body,
  primary,
}: {
  href: string;
  icon: typeof Swords;
  title: string;
  body: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-4 rounded-[var(--dame-radius)] border p-4 transition-colors duration-150 ${
        primary
          ? "border-[rgba(201,162,39,0.4)] bg-[rgba(201,162,39,0.08)] hover:border-[rgba(201,162,39,0.65)]"
          : "border-[rgba(242,237,227,0.08)] bg-[var(--dame-surface-deep)] hover:border-[rgba(201,162,39,0.35)]"
      }`}
    >
      <span
        aria-hidden="true"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{ background: "rgba(201,162,39,0.14)", color: "var(--dame-accent-hi)" }}
      >
        <Icon size={20} />
      </span>
      <span className="grid min-w-0 flex-1 leading-tight">
        <span className="font-semibold">{title}</span>
        <span className="truncate text-sm text-[var(--dame-muted)]">{body}</span>
      </span>
      <ChevronRight
        size={18}
        className="shrink-0 text-[var(--dame-muted)] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[var(--dame-accent-hi)]"
      />
    </Link>
  );
}

export default function Play() {
  return (
    <div className="grid justify-items-center gap-5 py-2">
      <h1 className="sr-only">Play</h1>
      <div className="grid w-full max-w-5xl gap-3 sm:grid-cols-3">
        <ModeCard
          href="/play/join"
          icon={UserPlus}
          title="Play a friend"
          body="Create an invite, share the code"
          primary
        />
        <ModeCard
          href="/play/bot"
          icon={Bot}
          title="Play the bot"
          body="Three levels, right in your browser"
        />
        <ModeCard
          href="#local"
          icon={Swords}
          title="Pass-and-play"
          body="Share one board, take turns"
        />
      </div>
      <div
        id="local"
        className="w-full"
        style={{ maxWidth: "min(600px, max(340px, calc(100dvh - 430px)))" }}
      >
        <LocalBoard />
      </div>
    </div>
  );
}
