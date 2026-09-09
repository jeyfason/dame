import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InviteEmail } from "./InviteEmail";

describe("InviteEmail", () => {
  it("renders host name, code, and invite link", () => {
    const html = renderToStaticMarkup(
      <InviteEmail
        hostName="Ada"
        code="ABCDEFGH"
        inviteUrl="https://dame.gg/join?code=ABCDEFGH"
      />,
    );
    expect(html).toContain("Ada");
    expect(html).toContain("ABCDEFGH");
    expect(html).toContain("https://dame.gg/join?code=ABCDEFGH");
  });
});
