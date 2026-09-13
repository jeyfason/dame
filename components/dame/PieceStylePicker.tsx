"use client";

import { PIECE_TEXTURES, usePieceTexture } from "@/lib/piece-texture";

/**
 * Segmented swatch picker for the piece texture. Each button previews the
 * texture on a cream disc; the choice applies site-wide via
 * `<html data-piece-texture>`.
 */
export function PieceStylePicker({ compact = false }: { compact?: boolean }) {
  const [texture, setTexture] = usePieceTexture();

  return (
    <div
      role="group"
      aria-label="Piece style"
      className="inline-flex items-center gap-1 rounded-[var(--dame-radius)] border border-[rgba(242,237,227,0.14)] bg-[var(--dame-surface-deep)] p-1"
    >
      {PIECE_TEXTURES.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          aria-pressed={texture === id ? "true" : "false"}
          aria-label={`${label} pieces`}
          title={label}
          data-piece-texture={id}
          onClick={() => setTexture(id)}
          className={`dame-piece-swatch inline-flex min-h-[40px] cursor-pointer items-center justify-center rounded-[10px] px-2 transition-colors duration-150 ${
            texture === id
              ? "bg-[rgba(201,162,39,0.18)] shadow-[inset_0_0_0_1.5px_var(--dame-accent)]"
              : "hover:bg-[rgba(242,237,227,0.06)]"
          }`}
        >
          <span
            aria-hidden="true"
            className={`dame-piece dame-piece-white h-5 w-5 ${compact ? "" : "sm:h-6 sm:w-6"}`}
          />
          <span aria-hidden="true" className="-ml-1.5 mt-2">
            <span
              className={`dame-piece dame-piece-black block h-4 w-4 ${compact ? "" : "sm:h-5 sm:w-5"}`}
            />
          </span>
        </button>
      ))}
    </div>
  );
}
