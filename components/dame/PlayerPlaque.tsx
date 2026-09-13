import type { ReactNode } from "react";

/**
 * chess.com-style player plaque: color chip, name, captured-piece tray.
 * The active player's plaque glows brass; the inactive one dims.
 */
export function PlayerPlaque({
  name,
  color,
  captured,
  active,
  note,
}: {
  name: string;
  color: "white" | "black";
  captured: number;
  active: boolean;
  note?: ReactNode;
}) {
  return (
    <div
      data-testid={`plaque-${color}`}
      aria-label={`${name} — ${active ? "to move" : "waiting"}`}
      className={`flex w-full min-w-0 items-center gap-3 rounded-[var(--dame-radius)] border px-3 py-2 transition-all duration-300 sm:px-4 sm:py-2.5 ${
        active
          ? "border-[rgba(201,162,39,0.55)] bg-[var(--dame-surface)] shadow-[0_0_18px_rgba(201,162,39,0.25),0_4px_12px_rgba(0,0,0,0.35)]"
          : "border-[rgba(242,237,227,0.08)] bg-[var(--dame-surface-deep)] opacity-70"
      }`}
    >
      <span
        aria-hidden="true"
        className={`dame-piece ${color === "white" ? "dame-piece-white" : "dame-piece-black"} h-7 w-7 shrink-0 sm:h-8 sm:w-8`}
      />
      <span className="grid min-w-0 flex-1 leading-tight">
        <span className="truncate text-sm font-semibold sm:text-[15px]">{name}</span>
        {note ? <span className="truncate text-xs text-[var(--dame-muted)]">{note}</span> : null}
      </span>
      <span
        aria-label={`Captured ${captured} pieces`}
        className="flex shrink-0 items-center gap-1.5"
      >
        <span className="flex items-center -space-x-1" aria-hidden="true">
          {Array.from({ length: Math.min(captured, 8) }).map((_, i) => (
            <span
              key={i}
              className={`dame-piece h-3.5 w-3.5 ${
                color === "white" ? "dame-piece-black" : "dame-piece-white"
              } ring-1 ring-[rgba(0,0,0,0.4)]`}
            />
          ))}
        </span>
        <span className="w-5 text-right text-xs font-semibold tabular-nums text-[var(--dame-muted)]">
          {captured > 0 ? captured : ""}
        </span>
      </span>
    </div>
  );
}
