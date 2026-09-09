import { renderToStaticMarkup } from "react-dom/server";
import { InviteEmail, type InviteEmailProps } from "./InviteEmail";
import { ResultEmail, type ResultEmailProps } from "./ResultEmail";

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
): string {
  return renderToStaticMarkup(<InviteEmail {...SAMPLE_INVITE} {...props} />);
}

export function renderResultHtml(
  props: Partial<ResultEmailProps> = {},
): string {
  return renderToStaticMarkup(<ResultEmail {...SAMPLE_RESULT} {...props} />);
}
