export type Color = "white" | "black";
export type PieceKind = "man" | "king";
export interface Piece { color: Color; kind: PieceKind }
export type Square = Piece | null;
export type Board = Square[][];
export interface Move { from: [number, number]; to: [number, number]; captures: [number, number][]; promotes: boolean }
export interface GameState { board: Board; turn: Color; winner: Color | null }
