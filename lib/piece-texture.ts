"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

export type PieceTexture = "classic" | "wood" | "marble" | "metal";

export const PIECE_TEXTURES: { id: PieceTexture; label: string }[] = [
  { id: "classic", label: "Classic lacquer" },
  { id: "wood", label: "Walnut grain" },
  { id: "marble", label: "Marble" },
  { id: "metal", label: "Brushed metal" },
];

export const PIECE_TEXTURE_STORAGE_KEY = "dame:piece-texture";
const CHANGE_EVENT = "dame:piece-texture-change";

export function isPieceTexture(v: string | null): v is PieceTexture {
  return (
    v === "classic" || v === "wood" || v === "marble" || v === "metal"
  );
}

export function getPieceTexture(): PieceTexture {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return "classic";
  try {
    const raw = localStorage.getItem(PIECE_TEXTURE_STORAGE_KEY);
    return isPieceTexture(raw) ? raw : "classic";
  } catch {
    return "classic";
  }
}

export function setPieceTexture(t: PieceTexture): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PIECE_TEXTURE_STORAGE_KEY, t);
  } catch {
    // storage unavailable — texture stays for this session only
  }
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function getServerSnapshot(): PieceTexture {
  return "classic";
}

/**
 * Selected piece texture + writer (useSyncExternalStore over localStorage,
 * so every picker on the page stays in sync, cross-tab included). The
 * chosen value is mirrored onto `<html data-piece-texture="…">` so the CSS
 * texture variants apply to every board and plaque without prop drilling.
 */
export function usePieceTexture(): [PieceTexture, (t: PieceTexture) => void] {
  const texture = useSyncExternalStore(subscribe, getPieceTexture, getServerSnapshot);

  const update = useCallback((t: PieceTexture) => {
    setPieceTexture(t);
    document.documentElement.dataset.pieceTexture = t;
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return [texture, update];
}

/** Keep <html data-piece-texture> in sync with the stored choice (used in Shell). */
export function PieceTextureSync(): null {
  const [texture] = usePieceTexture();
  useEffect(() => {
    document.documentElement.dataset.pieceTexture = texture;
  }, [texture]);
  return null;
}
