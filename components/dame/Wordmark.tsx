import Link from "next/link";

/**
 * "Dame" wordmark — Fraunces serif with a small brass disc-dot over the "a".
 * Pure CSS/SVG, no image asset (spec 2026-09-09 §3).
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Dame — home"
      className={`group inline-flex items-baseline font-heading text-[1.45rem] font-semibold leading-none tracking-tight text-[var(--dame-text)] transition-colors ${className}`}
    >
      D
      <span className="relative inline-block">
        a
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-[-0.14em] h-[0.16em] w-[0.16em] -translate-x-1/2 rounded-full shadow-[0_0_6px_rgba(201,162,39,0.8)] transition-transform duration-150 group-hover:scale-110"
          style={{ background: "var(--dame-accent)" }}
        />
      </span>
      me
    </Link>
  );
}
