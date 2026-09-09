import type { GameState, Move } from "../../lib/rules/types";

export const FRAME_LIMIT = 1_048_576; // 1MB frame cap per spec
export const PROTOCOL_VERSION = 0;
export const CHAT_MAX_LEN = 500;
export const CHAT_HISTORY_LIMIT = 50;
export const CHAT_RATE_LIMIT_MS = 1000;
export const TYPING_TIMEOUT_MS = 5000;

export type Role = "white" | "black";

// Client -> server
export interface JoinFrame {
  t: "join";
  token: string;
  lastVersion?: number;
}

export interface MoveFrame {
  t: "move";
  move: Move;
  baseVersion: number;
}

export interface ChatSendFrame {
  t: "chat";
  text: string;
}

export interface TypingSendFrame {
  t: "typing";
  on: boolean;
}

export type ClientFrame = JoinFrame | MoveFrame | ChatSendFrame | TypingSendFrame;

// Server -> client
export interface StateFrame {
  t: "state";
  state: GameState;
  version: number;
}

export interface PresenceFrame {
  t: "presence";
  you: Role;
  opponentConnected: boolean;
}

export interface RejectFrame {
  t: "reject";
  reason: string;
  state: GameState;
  version: number;
}

export interface EndFrame {
  t: "end";
  winner: "white" | "black" | "draw" | null;
  reason: string;
}

export interface ChatFrame {
  t: "chat";
  from: Role;
  text: string;
  at: number;
}

export interface TypingFrame {
  t: "typing";
  from: Role;
  on: boolean;
}

export type ServerFrame =
  | StateFrame
  | PresenceFrame
  | RejectFrame
  | EndFrame
  | ChatFrame
  | TypingFrame;

export class ProtocolError extends Error {
  readonly closeCode: number;
  constructor(message: string, closeCode = 1003) {
    super(message);
    this.name = "ProtocolError";
    this.closeCode = closeCode;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function parseClientFrame(raw: string | ArrayBuffer): ClientFrame {
  const text =
    typeof raw === "string" ? raw : new TextDecoder().decode(raw);
  if (text.length > FRAME_LIMIT) {
    throw new ProtocolError(`frame exceeds ${FRAME_LIMIT} bytes`, 1009);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ProtocolError("malformed JSON frame", 1003);
  }
  if (!isRecord(data) || typeof data.t !== "string") {
    throw new ProtocolError("malformed frame: missing t", 1003);
  }
  if (data.t === "join") {
    if (typeof data.token !== "string" || data.token.length === 0) {
      throw new ProtocolError("malformed join: missing token", 1003);
    }
    if (
      data.lastVersion !== undefined &&
      (typeof data.lastVersion !== "number" || data.lastVersion < 0)
    ) {
      throw new ProtocolError("malformed join: bad lastVersion", 1003);
    }
    return {
      t: "join",
      token: data.token,
      lastVersion: data.lastVersion as number | undefined,
    };
  }
  if (data.t === "move") {
    if (!isRecord(data.move)) {
      throw new ProtocolError("malformed move: missing move", 1003);
    }
    if (typeof data.baseVersion !== "number" || data.baseVersion < 0) {
      throw new ProtocolError("malformed move: bad baseVersion", 1003);
    }
    return { t: "move", move: data.move as unknown as Move, baseVersion: data.baseVersion };
  }
  if (data.t === "chat") {
    if (typeof data.text !== "string" || data.text.length === 0) {
      throw new ProtocolError("malformed chat: missing text", 1003);
    }
    return { t: "chat", text: data.text };
  }
  if (data.t === "typing") {
    if (typeof data.on !== "boolean") {
      throw new ProtocolError("malformed typing: missing on", 1003);
    }
    return { t: "typing", on: data.on };
  }
  throw new ProtocolError(`unknown frame type: ${data.t}`, 1003);
}

export function encodeServerFrame(frame: ServerFrame): string {
  return JSON.stringify(frame);
}
