import type { Board, Color, GameState, Move, Piece } from "./types";

const N = 10;
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < N && c >= 0 && c < N;
}

function isBackRank(color: Color, r: number): boolean {
  return color === "white" ? r === 0 : r === N - 1;
}

function key(r: number, c: number): string {
  return `${r},${c}`;
}

interface CapturePath {
  to: [number, number];
  captures: [number, number][];
}

function findManCaptures(
  board: Board,
  color: Color,
  r: number,
  c: number,
  originR: number,
  originC: number,
  captured: Set<string>,
  taken: [number, number][],
  out: CapturePath[],
): void {
  let extended = false;
  for (const [dr, dc] of DIRS) {
    const mr = r + dr;
    const mc = c + dc;
    const lr = r + 2 * dr;
    const lc = c + 2 * dc;
    if (!inBounds(mr, mc) || !inBounds(lr, lc)) continue;
    const mid = board[mr][mc];
    if (!mid || mid.color === color || captured.has(key(mr, mc))) continue;
    const landingVacant =
      board[lr][lc] === null || (lr === originR && lc === originC);
    if (!landingVacant) continue;
    extended = true;
    captured.add(key(mr, mc));
    taken.push([mr, mc]);
    findManCaptures(board, color, lr, lc, originR, originC, captured, taken, out);
    taken.pop();
    captured.delete(key(mr, mc));
  }
  if (!extended && taken.length > 0) {
    out.push({ to: [r, c], captures: taken.map((t) => [...t] as [number, number]) });
  }
}

function findKingCaptures(
  board: Board,
  color: Color,
  r: number,
  c: number,
  originR: number,
  originC: number,
  captured: Set<string>,
  taken: [number, number][],
  out: CapturePath[],
): void {
  let extended = false;
  for (const [dr, dc] of DIRS) {
    let sr = r + dr;
    let sc = c + dc;
    while (inBounds(sr, sc)) {
      const isOrigin = sr === originR && sc === originC;
      const sq = isOrigin ? null : board[sr][sc];
      if (sq === null) {
        sr += dr;
        sc += dc;
        continue;
      }
      if (sq.color === color || captured.has(key(sr, sc))) break;
      // Enemy piece: every empty square beyond is a landing branch.
      let lr = sr + dr;
      let lc = sc + dc;
      while (inBounds(lr, lc)) {
        const landIsOrigin = lr === originR && lc === originC;
        const land = landIsOrigin ? null : board[lr][lc];
        if (land !== null) break;
        extended = true;
        captured.add(key(sr, sc));
        taken.push([sr, sc]);
        findKingCaptures(board, color, lr, lc, originR, originC, captured, taken, out);
        taken.pop();
        captured.delete(key(sr, sc));
        lr += dr;
        lc += dc;
      }
      break;
    }
  }
  if (!extended && taken.length > 0) {
    out.push({ to: [r, c], captures: taken.map((t) => [...t] as [number, number]) });
  }
}

function quietMoves(board: Board, color: Color, r: number, c: number, piece: Piece): Move[] {
  const moves: Move[] = [];
  if (piece.kind === "man") {
    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (!inBounds(nr, nc) || board[nr][nc] !== null) continue;
      moves.push({
        from: [r, c],
        to: [nr, nc],
        captures: [],
        promotes: isBackRank(color, nr),
      });
    }
    return moves;
  }
  for (const [dr, dc] of DIRS) {
    let nr = r + dr;
    let nc = c + dc;
    while (inBounds(nr, nc) && board[nr][nc] === null) {
      moves.push({ from: [r, c], to: [nr, nc], captures: [], promotes: false });
      nr += dr;
      nc += dc;
    }
  }
  return moves;
}

export function legalMoves(state: GameState): Move[] {
  const { board, turn } = state;
  const captures: { piece: Piece; r: number; c: number; path: CapturePath }[] = [];
  const quiets: Move[] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const piece = board[r][c];
      if (!piece || piece.color !== turn) continue;
      const paths: CapturePath[] = [];
      if (piece.kind === "man") {
        findManCaptures(board, turn, r, c, r, c, new Set(), [], paths);
      } else {
        findKingCaptures(board, turn, r, c, r, c, new Set(), [], paths);
      }
      for (const path of paths) {
        captures.push({ piece, r, c, path });
      }
      if (paths.length === 0) {
        quiets.push(...quietMoves(board, turn, r, c, piece));
      }
    }
  }
  if (captures.length > 0) {
    // Mandatory captures, quantity-majority: keep max-capture paths only.
    let max = 0;
    for (const cp of captures) max = Math.max(max, cp.path.captures.length);
    return captures
      .filter((cp) => cp.path.captures.length === max)
      .map((cp) => ({
        from: [cp.r, cp.c] as [number, number],
        to: cp.path.to,
        captures: cp.path.captures,
        promotes:
          cp.piece.kind === "man" && isBackRank(turn, cp.path.to[0]),
      }));
  }
  return quiets;
}

export function initialBoard(): GameState {
  const board: Board = Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => null),
  );
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      if ((r + c) % 2 !== 1) continue;
      if (r <= 3) board[r][c] = { color: "black", kind: "man" };
      else if (r >= 6) board[r][c] = { color: "white", kind: "man" };
    }
  }
  return { board, turn: "white", winner: null };
}
