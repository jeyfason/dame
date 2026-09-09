import { createElement } from "react";
import { render } from "@react-email/render";
import { InviteEmail, type InviteEmailProps } from "./InviteEmail";
import { ResultEmail, type ResultEmailProps } from "./ResultEmail";

// Plain .ts module (no JSX) on purpose: Next.js App Routes refuse to import
// a project file that pulls in react-dom/server (see Task 4 fix), so HTML
// rendering goes through @react-email/render (node_modules, unaffected).
// Async in v2: callers must await.

export const SAMPLE_INVITE: InviteEmailProps = {
  hostName: "Ada",
  code: "ABCDEFGH",
  inviteUrl: "http://localhost:3000/play/join?code=ABCDEFGH",
};

export const SAMPLE_RESULT: ResultEmailProps = {
  gameId: "11111111-1111-4111-8111-111111111111",
  winner: "white",
  whiteName: "Ada",
  blackName: "Bob",
  whiteDelta: 12.3,
  blackDelta: -11.8,
  rematchUrl: "http://localhost:3000/play/join",
};

export function renderInviteHtml(
  props: Partial<InviteEmailProps> = {},
): Promise<string> {
  return render(createElement(InviteEmail, { ...SAMPLE_INVITE, ...props }));
}

export function renderResultHtml(
  props: Partial<ResultEmailProps> = {},
): Promise<string> {
  return render(createElement(ResultEmail, { ...SAMPLE_RESULT, ...props }));
}
